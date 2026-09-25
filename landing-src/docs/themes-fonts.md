---
title: Themes & fonts
description: Light, dark, or system; three font sizes; one settings panel.
eyebrow: Customization
permalink: /docs/themes-fonts/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved ships with a single coherent look and a small set of switches: app theme, font size, and a separate terminal palette. This page covers the first two — terminal colors live on their own page.

## Open Settings

Press <kbd>⌘,</kbd> (macOS) or <kbd>Ctrl,</kbd> (Linux) to open Settings. The **General** tab is where theme and font size live.

You can also click the gear icon in the top bar.

## App theme

Three modes, applied instantly:

| Mode | Behavior |
|---|---|
| **Light** | Force the light theme regardless of OS preference. |
| **Dark** | Force the dark theme. |
| **System** | Follow the OS — switches automatically when macOS / GNOME / KDE flips between light and dark. |

The theme is stored in `~/.purplemux/config.json` under `appTheme` and synced to every browser tab connected to the server. On the macOS native app, the OS title bar also updates.

{% call callout('note', 'Designed dark-first') %}
The brand is built around a deep purple-tinted neutral, and dark mode keeps the chroma at zero for a strictly achromatic surface. Light mode applies a barely-perceivable purple tint (hue 287) for warmth. Both are tuned for long sessions; pick whichever your eyes prefer.
{% endcall %}

## Font size

Three presets, surfaced as a button group:

- **Normal** — the default; root font-size follows the browser.
- **Large** — root font-size set to `18px`.
- **X-Large** — root font-size set to `20px`.

Because the entire UI is sized in `rem`, switching presets scales the whole interface — sidebar, dialogs, terminal — at once. The change applies in real time without reloading.

## What changes, what doesn't

Font size scales the **UI chrome and the terminal text**. It doesn't change:

- Heading hierarchy (relative sizes stay the same)
- Spacing — proportions are preserved
- Code-block syntax styling

If you want to tweak individual elements (e.g. only the terminal, or only the sidebar), see [Custom CSS](/purplemux-improved/docs/custom-css/).

## Per-device, not per-browser

Settings are stored on the server, not in localStorage. Switching to dark on your laptop will switch your phone too — open `https://<host>/` from the phone and the change is already there.

If you'd rather keep mobile and desktop different, that's not currently supported; file an issue if you need it.

## What's next

- **[Custom CSS](/purplemux-improved/docs/custom-css/)** — override individual colors and spacing.
- **[Terminal themes](/purplemux-improved/docs/terminal-themes/)** — separate palette for xterm.js.
- **[Keyboard shortcuts](/purplemux-improved/docs/keyboard-shortcuts/)** — every binding in one table.
