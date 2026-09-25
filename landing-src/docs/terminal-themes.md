---
title: Terminal themes
description: A separate color palette for the xterm.js terminal — pick one for light, one for dark.
eyebrow: Customization
permalink: /docs/terminal-themes/index.html
---
{% from "docs/callouts.njk" import callout %}

The terminal pane uses xterm.js with its own color palette, independent from the rest of the UI. You pick a dark theme and a light theme; purplemux-improved switches between them as the app theme switches.

## Open the picker

Settings (<kbd>⌘,</kbd>) → **Terminal** tab. You'll see two sub-tabs labeled Dark and Light, each with a grid of theme cards. Click one — it applies live to every open terminal.

## Why a separate palette

Terminal apps depend on the 16-color ANSI palette (red, green, yellow, blue, magenta, cyan, plus their bright variants). The UI palette is muted by design and would make terminal output unreadable. A purpose-built palette lets `vim`, `git diff`, syntax highlighting, and TUI tools render correctly.

Each theme defines:

- Background, foreground, cursor, selection
- Eight base ANSI colors (black, red, green, yellow, blue, magenta, cyan, white)
- Eight bright variants

## Bundled themes

**Dark**

- Snazzy *(default)*
- Dracula
- One Dark
- Tokyo Night
- Nord
- Catppuccin Mocha

**Light**

- Catppuccin Latte *(default)*
- GitHub Light
- One Light
- Solarized Light
- Tokyo Night Light
- Nord Light

The card preview shows the seven core ANSI colors against the theme's background, so you can eyeball contrast before committing.

## How light/dark switching works

You pick **one dark theme** and **one light theme** independently. The active theme is decided by the resolved app theme:

- App theme is **Dark** → your chosen dark theme.
- App theme is **Light** → your chosen light theme.
- App theme is **System** → tracks the OS, swaps automatically.

So choosing System for the app theme and configuring both sides gives you a terminal that follows your OS day/night without any extra wiring.

{% call callout('tip', 'Match the app, or contrast it') %}
Some people like the terminal to match the rest of the UI. Others prefer a high-contrast Dracula or Tokyo Night terminal even in a light app. Both work; the picker doesn't enforce anything.
{% endcall %}

## Per-theme, not per-tab

The choice is global. Every terminal pane and every Claude session uses the same active theme. There's no per-tab override; if you need that, file an issue.

## Adding your own

Custom theme entries aren't currently part of the UI. The bundled list lives in `src/lib/terminal-themes.ts`. If you build from source you can append your own; otherwise the supported path is to open a PR with the new theme.

## What's next

- **[Themes & fonts](/purplemux-improved/docs/themes-fonts/)** — app theme and font size.
- **[Custom CSS](/purplemux-improved/docs/custom-css/)** — override the rest of the UI.
- **[Editor integration](/purplemux-improved/docs/editor-integration/)** — open files in an external editor.
