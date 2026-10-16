import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Use the same PostCSS instance as Tailwind, rather than a system-wide installation.
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
const alphaFallback = require('../../../scripts/postcss-alpha-fallback.cjs');
const from = fileURLToPath(new URL('../../../src/styles/globals.css', import.meta.url));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('Safari 15.6 / 16 CSS output', () => {
  it.each(['development', 'production'])('emits usable styles in %s', async (mode) => {
    vi.stubEnv('NODE_ENV', mode);
    vi.resetModules();
    const { default: config } = await import('../../../postcss.config.mjs');
    const plugins = Object.entries(config.plugins).map(([name, options]) => {
      const plugin = require(name.startsWith('.') ? `../../../${name}` : name);
      return plugin(options);
    });
    const result = await postcss(plugins)
      .process(readFileSync(from, 'utf8'), { from });
    const css: string = result.css;

    // Safari before 16.5 ignores nested selectors; before 16.4 it ignores range queries.
    expect(/&[\s:.\[]/.test(css), 'uncompiled nesting').toBe(false);
    expect(/@media[^{}]*[<>]=?/.test(css), 'uncompiled media ranges').toBe(false);
    expect(/@media\s*not(?: all and)?\s*\(min-width:\s*48rem\)/.test(css), 'mobile breakpoint').toBe(true);
    expect(css.includes('.max-md\\:hidden'), 'mobile visibility utility').toBe(true);
    expect(/\[data-side="?left"?\]/.test(css), 'sheet positioning selector').toBe(true);

    // Safari 15.6 requires percentage lightness, including inside theme variables.
    expect(/okl(?:ab|ch)\(\s*[\d.]+\s/.test(css), 'unsupported numeric lightness').toBe(false);
    expect(/--background:\s*oklch\(99\.5%/.test(css), 'light theme').toBe(true);
    expect(/--background:\s*oklch\(7%/.test(css), 'dark theme').toBe(true);

    // Opacity colors must have a usable base rule before the color-mix enhancement.
    expect(/\.text-muted-foreground\\\/70\s*\{\s*color:\s*var\(--muted-foreground\)/.test(css), 'opacity fallback').toBe(true);
    expect(/@supports\s*\(color:\s*color-mix/.test(css), 'guarded color-mix enhancement').toBe(true);
    expect(css.includes('-webkit-backdrop-filter:'), 'prefixed backdrop filter').toBe(true);

    const legacyRules = postcss.parse(css);
    // Model Safari without color-mix, retaining the actual compiled cascade.
    legacyRules.walkAtRules('supports', (rule: { params: string; remove: () => void }) => {
      if (rule.params.includes('color-mix') && !rule.params.startsWith('not ')) rule.remove();
    });
    const legacyCss = legacyRules.toString();
    for (const [token, percent] of [
      ['destructive', '10'], ['destructive', '20'], ['destructive', '30'],
      ['ui-red', '15'], ['ui-teal', '15'], ['ui-blue', '15'],
      ['ui-amber', '15'], ['claude-active', '5'], ['claude-active', '10'],
      ['primary', '10'], ['muted-foreground', '70'],
    ]) {
      expect(legacyCss).toContain(`var(--${token}-alpha-${percent})`);
    }
    expect(legacyCss).toMatch(/--destructive-alpha-10:\s*oklch\(57\.7%\s+\.245\s+27\.325\s*\/\s*0\.1\)/);
    expect(legacyCss).toMatch(/--destructive-alpha-20:\s*oklch\(70\.4%\s+\.191\s+22\.216\s*\/\s*0\.2\)/);
    expect(legacyCss).toMatch(/--claude-active-alpha-10:\s*var\(--ui-purple-alpha-10\)/);
    expect(legacyCss).toMatch(/--input-alpha-30:\s*oklch\(100%\s+0\s+0\s*\/\s*0\.045\)/);
    expect(legacyCss).toMatch(/--color-black-alpha-10:\s*rgba\(0, 0, 0, 0\.1\)/);
    expect(css).toContain('color-mix(in oklab, var(--destructive) 10%, transparent)');

    // Every built-in variable mix must have a fallback, including variant selectors.
    const mixes = css.matchAll(/color-mix\(in oklab,\s*var\((--[\w-]+)\)\s+([\d.]+)%,\s*transparent\)/g);
    for (const [, name, percent] of mixes) {
      if (name.startsWith('--terminal-')) continue;
      expect(legacyCss, `${name} / ${percent}%`).toContain(`var(${name}-alpha-${percent.replace('.', '_')})`);
    }
  }, 30_000);

  it('keeps fallback colors scoped to their theme and multiplies existing alpha', async () => {
    const result = await postcss([alphaFallback()]).process(`
      :root { --danger: oklch(60% .2 25); --alias: var(--danger); --hex: #1238; }
      .dark { --danger: oklch(70% .1 25 / 50%); }
      @media (hover: hover) {
        @supports (color: color-mix(in lab, red, red)) {
          .danger:hover { background-color: color-mix(in oklab, var(--alias) 20%, transparent); }
          .hex { color: color-mix(in oklab, var(--hex) 12.5%, transparent); }
        }
      }
    `, { from: undefined });
    expect(result.css).toContain('--danger-alpha-20: oklch(60% .2 25 / 0.2)');
    expect(result.css).toContain('.dark { --danger: oklch(70% .1 25 / 50%); --danger-alpha-20: oklch(70% .1 25 / 0.1); }');
    expect(result.css).toContain('--alias-alpha-20: var(--danger-alpha-20)');
    expect(result.css).toContain('--hex-alpha-12_5: rgba(17, 34, 51, 0.066667)');
    expect(result.css).toMatch(/@media \(hover: hover\)\s*\{\s*@supports not/);
    expect(result.css).toContain('.danger:hover { background-color: var(--alias-alpha-20); }');
    expect(result.css).toContain('color-mix(in oklab, var(--alias) 20%, transparent)');
  });

  it('leaves runtime terminal colors, unknown colors and cyclic aliases unchanged', async () => {
    const css = `
      :root { --terminal-bg: #123456; --a: var(--b); --b: var(--a); }
      @supports (color: color-mix(in lab, red, red)) {
        .terminal { background-color: color-mix(in oklab, var(--terminal-bg) 90%, transparent); }
        .unknown { color: color-mix(in oklab, var(--missing) 50%, transparent); }
        .cycle { color: color-mix(in oklab, var(--a) 50%, transparent); }
      }
    `;
    const result = await postcss([alphaFallback()]).process(css, { from: undefined });
    expect(result.css).toBe(css);
  });
});
