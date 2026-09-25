---
title: Editor integration
description: Open the current folder in your editor — VS Code, Cursor, Zed, code-server, or a custom URL — straight from the header.
eyebrow: Customization
permalink: /docs/editor-integration/index.html
---
{% from "docs/callouts.njk" import callout %}

Every workspace has an **EDITOR** button in the header. Clicking it opens the active session's folder in the editor of your choice. Pick a preset, point at a URL or rely on the system handler, and you're done.

## Open the picker

Settings (<kbd>⌘,</kbd>) → **Editor** tab. You'll see a list of presets and, depending on the choice, a URL field.

## Available presets

| Preset | What it does |
|---|---|
| **Code Server (Web)** | Opens a hosted [code-server](https://github.com/coder/code-server) instance with `?folder=<path>`. Requires a URL. |
| **VS Code** | Triggers `vscode://file/<path>?windowId=_blank`. |
| **VS Code Insiders** | `vscode-insiders://...` |
| **Cursor** | `cursor://...` |
| **Windsurf** | `windsurf://...` |
| **Zed** | `zed://file<path>` |
| **Custom URL** | A URL template you control, with `{folder}` / `{folderEncoded}` placeholders. |
| **Disabled** | Hides the EDITOR button entirely. |

The four desktop-IDE presets (VS Code, Cursor, Windsurf, Zed) rely on the OS to register a URI handler. If you have the IDE installed locally, the link works as expected.

## Web vs. local

There's a meaningful distinction in how each preset opens a folder:

- **code-server** runs inside the browser. The URL points at the server you're hosting (yours, on your network, or fronted by Tailscale). Click the EDITOR button and a new tab loads the folder.
- **Local IDEs** (VS Code, Cursor, Windsurf, Zed) require the IDE to be installed on the *machine running the browser*. The link is handed to the OS, which launches the registered handler.

If you're using purplemux-improved on your phone, only the code-server preset works — phones can't open `vscode://` URLs into a desktop app.

## code-server setup

A typical local setup, surfaced in-product:

```bash
# Install on macOS
brew install code-server

# Run
code-server --port 8080

# External access via Tailscale (optional)
tailscale serve --bg --https=8443 http://localhost:8080
```

Then in the Editor tab, set the URL to the address code-server is reachable at — `http://localhost:8080` for local, or `https://<machine>.<tailnet>.ts.net:8443` if you've put it behind Tailscale Serve. purplemux-improved validates that the URL starts with `http://` or `https://` and appends `?folder=<absolute path>` automatically.

{% call callout('note', 'Pick a port that isn\'t 8022') %}
purplemux-improved already lives on `8022`. Run code-server on a different port (the example uses `8080`) so they don't fight.
{% endcall %}

## Custom URL template

The Custom preset lets you point at anything that takes a folder in its URL — Coder workspaces, Gitpod, Theia, an internal tool. The template **must** contain at least one of the placeholders:

- `{folder}` — absolute path, unencoded.
- `{folderEncoded}` — URL-encoded.

```
myeditor://open?path={folderEncoded}
https://my.coder.example/workspace?dir={folderEncoded}
```

purplemux-improved validates the template at save time and refuses one without a placeholder.

## Disabling the button

Pick **Disabled**. The button disappears from the workspace header.

## What's next

- **[Sidebar & Claude options](/purplemux-improved/docs/sidebar-options/)** — reorder sidebar items, toggle Claude flags.
- **[Custom CSS](/purplemux-improved/docs/custom-css/)** — further visual tuning.
- **[Tailscale](/purplemux-improved/docs/tailscale/)** — secure external access for code-server too.
