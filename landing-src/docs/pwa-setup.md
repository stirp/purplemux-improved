---
title: PWA setup
description: Add purplemux-improved to your home screen on iOS Safari and Android Chrome for a full-screen, app-like experience.
eyebrow: Mobile & Remote
permalink: /docs/pwa-setup/index.html
---
{% from "docs/callouts.njk" import callout %}

Installing purplemux-improved as a Progressive Web App turns the browser tab into a standalone icon on your home screen, with full-screen layout and proper splash screens. On iOS it's also the prerequisite for Web Push.

## What you get

- **Full-screen layout** — no browser chrome, more vertical space for terminal and timeline.
- **App icon** — purplemux-improved launches from the home screen like any native app.
- **Splash screens** — purplemux-improved ships per-device splash images for iPhones, so the launch transition feels native.
- **Web Push** (iOS only) — push notifications fire only after PWA install.

The manifest is served at `/api/manifest` and registers `display: standalone` with the purplemux-improved mark and theme color.

## Before you install

The page must be reachable over **HTTPS** for PWAs to work. From `localhost` it works in Chrome (loopback exception) but iOS Safari refuses to install over plain HTTP. The clean path is Tailscale Serve — see [Tailscale access](/purplemux-improved/docs/tailscale/).

{% call callout('warning', 'iOS needs Safari 16.4 or newer') %}
Earlier iOS releases can install the PWA but won't deliver Web Push. If push matters to you, update iOS first. Browser-by-browser detail lives in [Browser support](/purplemux-improved/docs/browser-support/).
{% endcall %}

## iOS Safari

1. Open the purplemux-improved URL in **Safari** (other iOS browsers don't expose Add to Home Screen for PWAs).
2. Tap the **Share** icon in the bottom toolbar.
3. Scroll the action sheet and choose **Add to Home Screen**.
4. Edit the name if you like, then tap **Add** in the top-right.
5. Launch purplemux-improved from the new home screen icon — it opens full-screen.

The first launch from the icon is the moment iOS treats it as a real PWA. Any push permission prompt should be triggered from inside this standalone window, not from a regular Safari tab.

## Android Chrome

Chrome auto-detects an installable manifest and offers a banner. If you don't see it:

1. Open the purplemux-improved URL in **Chrome**.
2. Tap the **⋮** menu in the top-right.
3. Choose **Install app** (sometimes labeled **Add to Home screen**).
4. Confirm. The icon appears on your home screen and in the app drawer.

Samsung Internet behaves the same way — the install prompt typically appears automatically.

## Verifying the install

Open purplemux-improved from the home screen icon. The browser address bar should be gone. If you still see browser UI, the manifest didn't apply — usually because the page is being loaded over plain HTTP or via an unusual proxy.

You can also confirm in **Settings → Notification** — once the PWA is installed and Web Push is supported, the toggle becomes enabled.

## Updating the PWA

There's nothing to do. The PWA loads the same `index.html` served by your purplemux-improved instance, so upgrading purplemux-improved upgrades the installed app on next launch.

To remove it, long-press the icon and pick the OS-native uninstall action.

## What's next

- **[Web Push notifications](/purplemux-improved/docs/web-push/)** — turn on background alerts now that the PWA is installed.
- **[Tailscale access](/purplemux-improved/docs/tailscale/)** — get the HTTPS URL iOS requires.
- **[Browser support](/purplemux-improved/docs/browser-support/)** — full compatibility matrix.
