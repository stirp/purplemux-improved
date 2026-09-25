---
title: Web browser panel
description: A built-in browser tab for testing dev output, drivable from the purplemux-improved CLI, with a device emulator for mobile viewports.
eyebrow: Workspaces & Terminal
permalink: /docs/web-browser-panel/index.html
---
{% from "docs/callouts.njk" import callout %}

Drop a web browser tab next to your terminal and Claude session. It runs your local dev server, the staging site, anything reachable — and you can drive it from the `purplemux-improved` CLI without leaving the shell.

## Open a browser tab

Add a new tab and pick **Web browser** as the panel type. Type a URL in the address bar — `localhost:3000`, an IP, or a full https URL. The address bar normalizes input: bare hostnames and IPs go to `http://`, everything else to `https://`.

The panel runs as a real Chromium webview when purplemux-improved is the macOS native app (Electron build), and falls back to an iframe when accessed from a regular browser. The iframe path covers most pages but won't run sites that send `X-Frame-Options: deny`; the Electron path doesn't have that limit.

{% call callout('note', 'Best in the native app') %}
Device emulation, CLI screenshots, and console / network capture only work in the Electron build. The browser-tab fallback gives you address bar, back / forward, and reload, but the deeper integrations need a webview.
{% endcall %}

## CLI-driven navigation

The panel exposes a small HTTP API that the bundled `purplemux-improved` CLI wraps. From any terminal — including the one sitting next to the browser panel — you can:

```bash
# list tabs and find a web-browser tab ID
purplemux-improved tab list -w <workspace-id>

# read the current URL + title
purplemux-improved tab browser url -w <ws> <tabId>

# capture a screenshot to a file (or full-page with --full)
purplemux-improved tab browser screenshot -w <ws> <tabId> -o shot.png --full

# tail recent console logs (500-entry ring buffer)
purplemux-improved tab browser console -w <ws> <tabId> --since 60000 --level error

# inspect network activity, optionally fetching a single response body
purplemux-improved tab browser network -w <ws> <tabId> --method POST --status 500
purplemux-improved tab browser network -w <ws> <tabId> --request <id>

# evaluate JavaScript inside the tab and get the serialized result
purplemux-improved tab browser eval -w <ws> <tabId> "document.title"
```

The CLI authenticates via a token in `~/.purplemux/cli-token` and reads the port from `~/.purplemux/port`. No flags needed when running on the same machine. Run `purplemux-improved help` for the full surface or `purplemux-improved api-guide` for the underlying HTTP endpoints.

This is what makes the panel useful for Claude: ask Claude to take a screenshot, check the console for the error, or run a probe script — and Claude has the same CLI you do.

## Device emulator

For mobile work, flip the panel into mobile mode. A device picker offers presets for iPhone SE through 14 Pro Max, Pixel 7, Galaxy S20 Ultra, iPad Mini, and iPad Pro 12.9". Each preset includes:

- Width / height
- Device pixel ratio
- A matching mobile user agent

Toggle portrait / landscape, and choose a zoom level (`fit` to scale to the panel, or fixed `50% / 75% / 100% / 125% / 150%`). When you change device, the webview reloads with the new UA so server-side mobile detection sees what your phone would.

## What's next

- **[Tabs & panes](/purplemux-improved/docs/tabs-panes/)** — putting the browser in a split next to Claude.
- **[Git workflow panel](/purplemux-improved/docs/git-workflow/)** — the other purpose-built panel type.
- **[Installation](/purplemux-improved/docs/installation/)** — the macOS native app, where the full webview integration lives.
