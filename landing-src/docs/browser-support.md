---
layout: layouts/doc.njk
title: Browser support
description: Desktop and mobile compatibility matrix, with notes on the browser-specific quirks you'll hit.
eyebrow: Getting Started
permalink: /docs/browser-support/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved is a web app, so the experience depends on the browser you open it in. These are the versions we actively test against — older browsers may work but aren't supported.

## Desktop

| Browser | Minimum | Notes |
|---|---|---|
| Chrome | 110+ | Recommended. Full PWA + Web Push. |
| Edge | 110+ | Same engine as Chrome, same support. |
| Safari | 17+ | Full PWA on macOS Sonoma+. Web Push requires macOS 13+ and an installed PWA. |
| Firefox | 115+ ESR | Works well. PWA install is manual (no install prompt). |

All features — xterm.js terminal, live timeline, Claude session view, Git diff panel — work identically across these engines.

## Mobile

| Browser | Minimum | Notes |
|---|---|---|
| iOS Safari | **16.4+** | Required for Web Push. Must **Add to Home Screen** first; push won't fire from a regular tab. |
| Android Chrome | 110+ | Web Push works from a regular tab too, but we recommend installing as PWA for full-screen layout. |
| Samsung Internet | 22+ | Works. Install prompt appears automatically. |

{% call callout('warning', 'iOS Safari ≥ 16.4 is the cutoff') %}
Apple added Web Push to iOS only in Safari 16.4 (March 2023). Earlier iOS versions can still use the dashboard, but you won't get push notifications even after installing the PWA.
{% endcall %}

## Feature requirements

purplemux-improved leans on a handful of modern browser APIs. If any of these are missing, the app falls back gracefully but loses the corresponding feature.

| API | Used for | Fallback |
|---|---|---|
| WebSocket | Terminal I/O, status sync, timeline | Hard requirement — no fallback. |
| Clipboard API | `npx purplemux-improved@latest` copy, code-block copy | Button is hidden if unavailable. |
| Notifications API | Desktop / mobile push | Skipped — you'll still see in-app status. |
| Service Workers | PWA + Web Push | Served only as a normal web app. |
| IntersectionObserver | Live session timeline, nav reveal | Elements render without animation. |
| `backdrop-filter` | Translucent nav, modals | Falls back to a solid tinted background. |
| CSS `color-mix()` + OKLCH | Theme variables | Safari < 16.4 loses some tinted states. |

## Is my browser OK?

purplemux-improved ships a built-in self-check at **Settings → Browser check**. It runs the same probes listed above and shows a green / amber / red badge per feature, so you can verify without reading a spec sheet.

## Known quirks

- **Safari 17 + private windows** — IndexedDB is disabled, so your workspace cache won't persist across restarts. Use a regular window.
- **iOS Safari + background tab** — terminals are automatically torn down after ~30s in the background. Tmux keeps the actual session alive; the UI reconnects when you return.
- **Firefox + Tailscale Serve certificate** — if you use a custom tailnet name that isn't in `ts.net`, Firefox can be pickier about HTTPS trust than Chrome. Accept the certificate once and it sticks.
- **Self-signed certs** — Web Push simply won't register. Use Tailscale Serve (automatic Let's Encrypt) or a real domain + reverse proxy.

## Unsupported

- **Internet Explorer** — not supported, ever.
- **UC Browser, Opera Mini, Puffin** — proxy-based browsers break WebSocket. Won't work.
- **Any browser < 3 years old** — our CSS uses OKLCH color and container queries that need a 2023-era engine.

If you're on an unusual setup and something doesn't work, please [open an issue](https://github.com/stirp/purplemux-improved/issues) with your user agent and the self-check output.
