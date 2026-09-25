---
title: Tailscale access
description: Reach purplemux-improved from your phone over HTTPS via Tailscale Serve — no port forwarding, no certificate juggling.
eyebrow: Mobile & Remote
permalink: /docs/tailscale/index.html
---
{% from "docs/callouts.njk" import callout %}

By default purplemux-improved only listens locally. Tailscale Serve is the cleanest way to expose it to your other devices: WireGuard-encrypted, automatic Let's Encrypt certificates, and zero firewall changes.

## Why Tailscale

- **WireGuard** — every connection is encrypted device-to-device.
- **Automatic HTTPS** — Tailscale provisions a real cert for `*.<tailnet>.ts.net`.
- **No port forwarding** — your machine never opens a port to the public internet.
- **HTTPS is mandatory for iOS** — PWA install and Web Push both refuse to work without it. See [PWA setup](/purplemux-improved/docs/pwa-setup/) and [Web Push](/purplemux-improved/docs/web-push/).

## Prerequisites

- A Tailscale account, with the `tailscale` daemon installed and signed in on the machine running purplemux-improved.
- HTTPS enabled on the tailnet (Admin console → DNS → enable HTTPS Certificates, if it isn't already).
- purplemux-improved running on the default port `8022` (or wherever you've set `PORT`).

## Run it

One line:

```bash
tailscale serve --bg 8022
```

Tailscale wraps your local `http://localhost:8022` in HTTPS and exposes it inside the tailnet at:

```
https://<machine>.<tailnet>.ts.net
```

`<machine>` is the hostname of the box; `<tailnet>` is your tailnet's MagicDNS suffix. Open that URL on any other device signed into the same tailnet and you're in.

To stop serving:

```bash
tailscale serve --bg off 8022
```

## What you can do once it works

- Open the URL on your phone, tap **Share → Add to Home Screen**, and follow [PWA setup](/purplemux-improved/docs/pwa-setup/).
- Turn on push from inside the standalone PWA: [Web Push](/purplemux-improved/docs/web-push/).
- Reach the same dashboard from a tablet, a laptop, or another desktop — workspace state syncs in real time.

{% call callout('tip', 'Funnel vs Serve') %}
`tailscale serve` keeps purplemux-improved private to your tailnet — that's almost always what you want. `tailscale funnel` would expose it to the public internet, which is overkill (and risky) for a personal multiplexer.
{% endcall %}

## Reverse-proxy fallback

If Tailscale isn't an option, any reverse proxy with a real TLS certificate will do. The one thing you must get right is **WebSocket upgrades** — purplemux-improved uses them for terminal I/O, status sync, and the live timeline.

Nginx (sketch):

```
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 86400;
}
```

Caddy is simpler — `reverse_proxy 127.0.0.1:8022` handles upgrade headers automatically.

Without `Upgrade` / `Connection` forwarding the dashboard renders, but terminals never connect and status stays stuck. If something feels half-working, suspect those headers first.

## Troubleshooting

- **HTTPS not provisioned yet** — first cert can take a minute. Re-running `tailscale serve --bg 8022` after a short wait usually settles it.
- **Browser warns about cert** — make sure you're hitting the `<machine>.<tailnet>.ts.net` URL exactly, not the LAN IP.
- **Mobile says "not reachable"** — confirm the phone is signed into the same tailnet and that Tailscale is active in the OS settings.
- **Self-signed certs** — Web Push won't register. Use Tailscale Serve or a real ACME-issued cert via your reverse proxy.

## What's next

- **[PWA setup](/purplemux-improved/docs/pwa-setup/)** — install on the home screen now that you have HTTPS.
- **[Web Push notifications](/purplemux-improved/docs/web-push/)** — turn on background alerts.
- **[Security & auth](/purplemux-improved/docs/security-auth/)** — password, hashing, and what the tailnet exposure implies.
