---
layout: layouts/doc.njk
title: Quickstart
description: Get purplemux-improved running in under a minute with Node.js and tmux.
eyebrow: Getting Started
permalink: /docs/quickstart/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved is a web-native multiplexer that manages every Claude Code session on one dashboard, backed by `tmux` for persistence and built for use from both your desk and your phone.

## Before you start

You need two things on the machine that will host purplemux-improved.

- **Node.js 20 or newer** — check with `node -v`.
- **tmux** — check with `tmux -V`. Any version 3.0+ is fine.

{% call callout('note', 'macOS / Linux only') %}
Windows is not officially supported. purplemux-improved relies on `node-pty` and tmux, which don't run natively on Windows. WSL2 usually works but is outside our test matrix.
{% endcall %}

## Run it

One command. No global install required.

```bash
npx purplemux-improved@latest
```

You'll see purplemux-improved start on port `8022`. Open a browser:

```
http://localhost:8022
```

First launch walks you through creating a password and your first workspace.

{% call callout('tip') %}
Prefer a persistent install? `pnpm add -g purplemux-improved && purplemux-improved` works the same way. Upgrades are one `pnpm up -g purplemux-improved` away.
{% endcall %}

## Open a Claude session

From the dashboard:

1. Click **New tab** in any workspace.
2. Pick the **Claude** template (or just run `claude` in a plain terminal).
3. purplemux-improved detects the running Claude CLI and starts surfacing status, the live timeline, and permission prompts.

Your session now persists even if you close the browser — tmux keeps the process alive on the server.

## Reach it from your phone

By default purplemux-improved only listens on `localhost`. For safe external access, use Tailscale Serve (WireGuard + automatic HTTPS, no port forwarding):

```bash
tailscale serve --bg 8022
```

Open `https://<machine>.<tailnet>.ts.net` on your phone, tap **Share → Add to Home Screen**, and purplemux-improved becomes a PWA that receives Web Push notifications in the background.

See [Tailscale access](/purplemux-improved/docs/tailscale/) for the full setup, or jump to [PWA setup](/purplemux-improved/docs/pwa-setup/) for iOS and Android specifics.

## What's next

- **[Installation](/purplemux-improved/docs/installation/)** — platform details, native macOS app, autostart.
- **[Browser support](/purplemux-improved/docs/browser-support/)** — desktop and mobile compatibility matrix.
- **[First session](/purplemux-improved/docs/first-session/)** — a guided tour of the dashboard.
- **[Keyboard shortcuts](/purplemux-improved/docs/keyboard-shortcuts/)** — every binding in one table.
