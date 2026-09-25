---
title: Security & auth
description: How purplemux-improved protects your dashboard — scrypt-hashed password, local-only data, and HTTPS for external access.
eyebrow: Mobile & Remote
permalink: /docs/security-auth/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved is self-hosted and stays on your machine. There are no external servers, no telemetry, and no cloud account. Everything below describes the few pieces that actually guard your dashboard.

## Password setup

The first time you open purplemux-improved, the onboarding screen asks you to pick a password. After you submit:

- The password is hashed with **scrypt** (random 16-byte salt, 64-byte derived key).
- The hash is written to `~/.purplemux/config.json` as `scrypt:{salt}:{hash}` — the plaintext is never stored.
- A separate `authSecret` (random hex) is generated and stored alongside it. purplemux-improved uses it to sign the session cookie issued after login.

Subsequent visits show a login screen that verifies your password with `crypto.timingSafeEqual` against the stored hash.

{% call callout('note', 'Password length') %}
The minimum is short (4 characters) so localhost-only setups aren't annoying. If you expose purplemux-improved to a tailnet — or anywhere else — pick something stronger. Failed logins are rate-limited to 16 attempts per 15 minutes per process.
{% endcall %}

## Resetting the password

Forgot it? You only need shell access to the host:

```bash
rm ~/.purplemux/config.json
```

Restart purplemux-improved (`pnpm start`, `npx purplemux-improved@latest`, or whichever way you launched it) and the onboarding screen reappears so you can pick a new password.

This wipes other settings stored in the same file (theme, locale, font size, notifications toggle, etc.). Your workspaces and tabs live in `workspaces.json` and the `workspaces/` directory, so layouts are unaffected.

## HTTPS for external access

The default bind is `localhost`, served over plain HTTP. That's fine on the same machine — but the moment you reach purplemux-improved from another device, you should be on HTTPS.

- **Tailscale Serve** is the recommended path: WireGuard encryption plus automatic Let's Encrypt certs. See [Tailscale access](/purplemux-improved/docs/tailscale/).
- **Reverse proxy** (Nginx, Caddy, etc.) works too, as long as you forward the WebSocket `Upgrade` and `Connection` headers.

iOS Safari additionally requires HTTPS for PWA install and Web Push registration. See [PWA setup](/purplemux-improved/docs/pwa-setup/) and [Web Push](/purplemux-improved/docs/web-push/).

## What lives in `~/.purplemux/`

Everything is local. Permissions on sensitive files are `0600`.

| File | What it holds |
|---|---|
| `config.json` | scrypt password hash, session secret, app preferences |
| `workspaces.json` + `workspaces/` | workspace list and per-workspace pane/tab layouts |
| `vapid-keys.json` | Web Push VAPID keypair (auto-generated) |
| `push-subscriptions.json` | per-device push subscriptions |
| `cli-token` | shared token for hooks/CLI to talk to the local server |
| `pmux.lock` | single-instance lock (`pid`, `port`, `startedAt`) |
| `logs/` | rolling pino log files |

For the full inventory and reset table, see the source-of-truth listing in [docs/DATA-DIR.md](https://github.com/stirp/purplemux-improved/blob/main/docs/DATA-DIR.md).

## No telemetry

purplemux-improved makes no outbound requests on its own. The only network calls it initiates are:

- Web Push notifications you subscribed to, sent through the OS push services.
- Whatever the Claude CLI itself does — that's between you and Anthropic, not purplemux-improved.

Code and session data never leave your machine.

## What's next

- **[Tailscale access](/purplemux-improved/docs/tailscale/)** — the safe path to external HTTPS.
- **[PWA setup](/purplemux-improved/docs/pwa-setup/)** — once auth is sorted, install on the home screen.
- **[Web Push notifications](/purplemux-improved/docs/web-push/)** — background alerts.
