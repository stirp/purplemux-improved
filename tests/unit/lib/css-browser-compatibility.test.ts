import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import tailwind from '@tailwindcss/postcss';

// Use the same PostCSS instance as Tailwind, rather than a system-wide installation.
const require = createRequire(import.meta.url);
const postcss = createRequire(require.resolve('@tailwindcss/postcss'))('postcss');
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
    const result = await postcss([tailwind(config.plugins['@tailwindcss/postcss'])])
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
  });
});
