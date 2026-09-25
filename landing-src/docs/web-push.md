---
title: Web Push notifications
description: Background push alerts for needs-input and task-completion states, even when the browser tab is closed.
eyebrow: Mobile & Remote
permalink: /docs/web-push/index.html
---
{% from "docs/callouts.njk" import callout %}

Web Push lets purplemux-improved nudge you when a Claude session needs your attention — a permission prompt, a finished task — even after you've closed the tab. Tap the notification and you land directly on that session.

## What triggers a notification

purplemux-improved fires a push for the same transitions you see as colored badges in the sidebar.

- **Needs input** — Claude hit a permission prompt or asked a question.
- **Task completion** — Claude finished a turn (the **review** state).

Idle and busy transitions are intentionally not pushed. They're noise.

## Enable it

The toggle is at **Settings → Notification**. Steps:

1. Open **Settings → Notification** and turn it **On**.
2. The browser asks for notification permission — grant it.
3. purplemux-improved registers a Web Push subscription against the server's VAPID keys.

The subscription is stored in `~/.purplemux/push-subscriptions.json` and identifies your specific browser/device. Repeat the steps on each device you want to be notified on.

{% call callout('warning', 'iOS requires Safari 16.4 + a PWA') %}
On iPhone and iPad, Web Push only works after you've added purplemux-improved to the home screen and launched it from that icon. Open the Settings page from the standalone PWA window — the notification permission prompt will be a no-op in a regular Safari tab. Set up the PWA first: [PWA setup](/purplemux-improved/docs/pwa-setup/).
{% endcall %}

## VAPID keys

purplemux-improved generates an application-server VAPID keypair on first run and stores it at `~/.purplemux/vapid-keys.json` (mode `0600`). You don't need to do anything — the public key is served to the browser automatically when you subscribe.

If you ever want to reset all subscriptions (for example after rotating keys), delete `vapid-keys.json` and `push-subscriptions.json` and restart purplemux-improved. Every device will need to re-subscribe.

## Background delivery

Once subscribed, your phone receives the notification through the OS push service:

- **iOS** — APNs, via Safari's Web Push bridge. Delivery is best-effort and can be coalesced if your phone is heavily throttled.
- **Android** — FCM via Chrome. Generally instant.

The notification arrives whether or not purplemux-improved is in the foreground. If the dashboard is currently visible on _any_ of your devices, purplemux-improved skips the push to avoid double-buzz.

## Tap to jump in

Tapping a notification opens purplemux-improved directly to the session that fired it. If the PWA is already running, focus shifts to the right tab; otherwise the app launches and navigates straight there.

## Troubleshooting

- **Toggle is greyed out** — Service Workers or Notifications API aren't supported. Run **Settings → Browser check**, or see [Browser support](/purplemux-improved/docs/browser-support/).
- **Permission was denied** — clear the site's notification permission in your browser settings, then re-toggle in purplemux-improved.
- **No pushes on iOS** — confirm you're launching from the home-screen icon, not Safari. Confirm iOS is **16.4 or newer**.
- **Self-signed cert** — Web Push will refuse to register. Use Tailscale Serve or a reverse proxy with a real certificate. See [Tailscale access](/purplemux-improved/docs/tailscale/).

## What's next

- **[PWA setup](/purplemux-improved/docs/pwa-setup/)** — required for iOS push.
- **[Tailscale access](/purplemux-improved/docs/tailscale/)** — HTTPS for external delivery.
- **[Security & auth](/purplemux-improved/docs/security-auth/)** — what else lives under `~/.purplemux/`.
