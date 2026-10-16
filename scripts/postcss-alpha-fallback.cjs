const mixPattern = /color-mix\(in oklab,\s*var\((--[\w-]+)\)\s+([\d.]+)%,\s*transparent\)/g;
const fallbackName = (name, percent) => `${name}-alpha-${percent.replace('.', '_')}`;

const withAlpha = (value, percent) => {
  const opacity = Number(percent) / 100;
  const color = value.match(/^(oklch|oklab)\(([^/()]+?)(?:\s*\/\s*([\d.]+%?))?\)$/);
  if (color) {
    const [, space, channels, alpha = '1'] = color;
    const originalAlpha = parseFloat(alpha) / (alpha.endsWith('%') ? 100 : 1);
    return `${space}(${channels.trim()} / ${Number((originalAlpha * opacity).toFixed(6))})`;
  }

  const hex = value.match(/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i);
  if (!hex) return null;
  const expanded = hex[1].length <= 4 ? [...hex[1]].map((part) => part + part).join('') : hex[1];
  const channels = expanded.match(/../g).map((part) => parseInt(part, 16));
  return `rgba(${channels.slice(0, 3).join(', ')}, ${Number(((channels[3] ?? 255) / 255 * opacity).toFixed(6))})`;
};

module.exports = () => ({
  postcssPlugin: 'purplemux-alpha-fallback',
  // Tailwind first flattens nesting and emits its opaque color-mix fallback.
  OnceExit(root) {
    const definitions = new Map();
    root.walkDecls(/^--/, (decl) => {
      const entries = definitions.get(decl.prop) ?? [];
      entries.push(decl);
      definitions.set(decl.prop, entries);
    });
    const generated = new Map();

    const ensureColor = (name, percent, visiting = new Set()) => {
      const property = fallbackName(name, percent);
      if (generated.has(property)) return property;
      // These variables are replaced at runtime by the terminal theme.
      if (name.startsWith('--terminal-') || visiting.has(name)) return null;
      const entries = definitions.get(name);
      if (!entries) return null;
      const next = new Set([...visiting, name]);
      const values = entries.map((decl) => {
        const alias = decl.value.match(/^var\((--[\w-]+)\)$/);
        if (!alias) return withAlpha(decl.value, percent);
        const target = ensureColor(alias[1], percent, next);
        return target ? `var(${target})` : null;
      });
      if (values.some((value) => value === null)) return null;
      generated.set(property, entries.map((decl, index) => ({ decl, value: values[index] })));
      return property;
    };

    root.walkAtRules('supports', (rule) => {
      if (!/^\(color:\s*color-mix\(in lab,\s*red,\s*red\)\)$/.test(rule.params)) return;
      const fallback = rule.clone({ params: `not ${rule.params}` });
      let changed = false;
      fallback.walkDecls((decl) => {
        let replaced = false;
        const value = decl.value.replace(mixPattern, (match, name, percent) => {
          const property = ensureColor(name, percent);
          if (!property) return match;
          replaced = true;
          return `var(${property})`;
        });
        if (replaced) {
          decl.value = value;
          changed = true;
        } else {
          decl.remove();
        }
      });
      fallback.walkRules((child) => { if (!child.nodes.length) child.remove(); });
      fallback.walkAtRules((child) => { if (child.nodes && !child.nodes.length) child.remove(); });
      if (changed) rule.before(fallback);
    });

    for (const [prop, entries] of generated) {
      for (const { decl, value } of entries) decl.cloneAfter({ prop, value });
    }
  },
});
module.exports.postcss = true;
