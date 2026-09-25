---
title: Custom CSS
description: Override CSS variables to retune colors, spacing, and individual surfaces.
eyebrow: Customization
permalink: /docs/custom-css/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved is built on a CSS variable system. You can change almost anything visual without touching the source — paste rules into the **Appearance** tab, click Apply, and they take effect immediately on every connected client.

## Where to put it

Open Settings (<kbd>⌘,</kbd>) and pick **Appearance**. You'll see a single textarea labeled Custom CSS.

1. Write your rules.
2. Click **Apply**. The CSS is injected into a `<style>` tag on every page.
3. Click **Reset** to clear all overrides.

The CSS is stored on the server in `~/.purplemux/config.json` (`customCSS`), so it applies on every device that connects.

{% call callout('note', 'Server-wide, not per-device') %}
Custom CSS lives in the server config and follows you to every browser. If you want one device to look different from another, that's not currently supported.
{% endcall %}

## How it works

Most colors, surfaces, and accents in purplemux-improved are exposed as CSS variables under `:root` (light) and `.dark`. Overriding the variable cascades the change everywhere that variable is used — sidebar, dialogs, charts, status badges.

Changing a single variable is almost always better than overriding component selectors directly. Component classes are not a stable API; variables are.

## A minimal example

Tone the sidebar a touch warmer in light mode and push the dark surface darker:

```css
:root {
  --sidebar: oklch(0.96 0.012 80);
}

.dark {
  --background: oklch(0.05 0 0);
}
```

Or recolor the brand without touching anything else:

```css
:root {
  --primary: oklch(0.55 0.16 280);
}

.dark {
  --primary: oklch(0.78 0.14 280);
}
```

## Variable groups

The Appearance panel exposes the full list under **Available Variables**. The major buckets are:

- **Surface** — `--background`, `--card`, `--popover`, `--muted`, `--secondary`, `--accent`, `--sidebar`
- **Text** — `--foreground` and the matching `*-foreground` variants
- **Interactive** — `--primary`, `--primary-foreground`, `--destructive`
- **Border** — `--border`, `--input`, `--ring`
- **Palette** — `--ui-blue`, `--ui-teal`, `--ui-coral`, `--ui-amber`, `--ui-purple`, `--ui-pink`, `--ui-green`, `--ui-gray`, `--ui-red`
- **Semantic** — `--positive`, `--negative`, `--accent-color`, `--brand`, `--focus-indicator`, `--claude-active`

For the full token list with default oklch values and the design rationale, see [`docs/STYLE.md`](https://github.com/stirp/purplemux-improved/blob/main/docs/STYLE.md) in the repo. That document is the source of truth.

## Targeting only one mode

Wrap rules in `:root` for light and `.dark` for dark. The class is set on `<html>` by `next-themes`.

```css
:root {
  --muted: oklch(0.95 0.01 287);
}

.dark {
  --muted: oklch(0.18 0 0);
}
```

If you only need to change one mode, leave the other untouched.

## What about the terminal?

The xterm.js terminal uses its own palette, picked from a curated list — it's not driven by these CSS variables. Switch it on the **Terminal** tab. See [Terminal themes](/purplemux-improved/docs/terminal-themes/).

## What's next

- **[Themes & fonts](/purplemux-improved/docs/themes-fonts/)** — light, dark, system; font-size presets.
- **[Terminal themes](/purplemux-improved/docs/terminal-themes/)** — separate palette for the terminal area.
- **[Sidebar & Claude options](/purplemux-improved/docs/sidebar-options/)** — reorder items, toggle Claude flags.
