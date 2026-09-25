---
title: Ports & env vars
description: Every port purplemux-improved opens and every environment variable that influences how it runs.
eyebrow: Reference
permalink: /docs/ports-env-vars/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved is meant to be a one-line install, but the runtime is configurable. This page lists every port it opens and every environment variable that the server reads.

## Ports

| Port | Default | Override | Notes |
|---|---|---|---|
| HTTP + WebSocket | `8022` | `PORT=9000 purplemux-improved` | If `8022` is already in use the server logs a warning and binds to a random free port instead. |
| Internal Next.js (production) | random | — | In `pnpm start` / `purplemux-improved start` the outer server proxies to a Next.js standalone bound to `127.0.0.1:<random>`. Not exposed. |

`8022` is `web` + `ssh` glued together. The choice is humour, not protocol.

{% call callout('note', 'Bound interface follows the access policy') %}
purplemux-improved only binds to `0.0.0.0` if the access policy actually allows external clients. Localhost-only setups bind to `127.0.0.1` so other machines on the LAN can't even open a TCP connection. See `HOST` below.
{% endcall %}

## Server env vars

Read by `server.ts` and the modules it loads on startup.

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `8022` | HTTP/WS listen port. Falls back to a random port on `EADDRINUSE`. |
| `HOST` | unset | Comma-separated CIDR/keyword spec for which clients are allowed. Keywords: `localhost`, `tailscale`, `lan`, `all` (or `*` / `0.0.0.0`). Examples: `HOST=localhost`, `HOST=localhost,tailscale`, `HOST=10.0.0.0/8,localhost`. When set via env, the in-app **Settings → Network access** is locked. |
| `NODE_ENV` | `production` (in `purplemux-improved start`), `development` (in `pnpm dev`) | Selects between the dev pipeline (`tsx watch`, Next dev) and the prod pipeline (`tsup` bundle proxying to Next standalone). |
| `__PMUX_APP_DIR` | `process.cwd()` | Override the directory that holds `dist/server.js` and `.next/standalone/`. Set automatically by `bin/purplemux.js`; you usually shouldn't touch it. |
| `__PMUX_APP_DIR_UNPACKED` | unset | Variant of `__PMUX_APP_DIR` for the asar-unpacked path inside the macOS Electron app. |
| `__PMUX_ELECTRON` | unset | When the Electron main process starts the server in-process, it sets this so `server.ts` skips the auto `start()` call and lets Electron drive the lifecycle. |
| `PURPLEMUX_CLI` | `1` (set by `bin/purplemux.js`) | Marker that lets shared modules know the process is the CLI / server, not Electron. Used by `pristine-env.ts`. |
| `__PMUX_PRISTINE_ENV` | unset | JSON snapshot of the parent shell env, captured by `bin/purplemux.js` so child processes (claude, tmux) inherit the user's `PATH` rather than a sanitized one. Internal — set automatically. |
| `AUTH_PASSWORD` | unset | Set by the server from `config.json`'s scrypt hash before Next starts. NextAuth reads it from there. Don't set it manually. |
| `NEXTAUTH_SECRET` | unset | Same story — populated from `config.json` at startup. |

## Logging env vars

Read by `src/lib/logger.ts`.

| Variable | Default | Effect |
|---|---|---|
| `LOG_LEVEL` | `info` | Root level for everything not named in `LOG_LEVELS`. |
| `LOG_LEVELS` | unset | Per-module overrides as `name=level` pairs separated by commas. |

Levels, in order: `trace` · `debug` · `info` · `warn` · `error` · `fatal`.

```bash
LOG_LEVEL=debug purplemux-improved

# only debug the Claude hook module
LOG_LEVELS=hooks=debug purplemux-improved

# multiple modules at once
LOG_LEVELS=hooks=debug,status=warn,tmux=trace purplemux-improved
```

The most useful module names:

| Module | Source | What you see |
|---|---|---|
| `hooks` | `pages/api/status/hook.ts`, parts of `status-manager.ts` | Hook receive / process / state transitions |
| `status` | `status-manager.ts` | Polling, JSONL watcher, broadcast |
| `tmux` | `lib/tmux.ts` | Every tmux command and its result |
| `server`, `lock`, etc. | matching `lib/*.ts` | Process lifecycle |

Log files land under `~/.purplemux/logs/` regardless of level.

## Files (env-equivalent)

A few values behave like environment variables but live on disk so the CLI and hook scripts can find them without an env handshake:

| File | Holds | Used by |
|---|---|---|
| `~/.purplemux/port` | Current server port (plain text) | `bin/cli.js`, `status-hook.sh`, `statusline.sh` |
| `~/.purplemux/cli-token` | 32-byte hex CLI token | `bin/cli.js`, hook scripts (sent as `x-pmux-token`) |

The CLI also accepts these via env, which take precedence:

| Variable | Default | Effect |
|---|---|---|
| `PMUX_PORT` | contents of `~/.purplemux/port` | Port the CLI talks to. |
| `PMUX_TOKEN` | contents of `~/.purplemux/cli-token` | Bearer token sent as `x-pmux-token`. |

See [CLI reference](/purplemux-improved/docs/cli-reference/) for the full surface.

## Putting it together

A few common combinations:

```bash
# Default: localhost only, port 8022
purplemux-improved

# Bind everywhere (LAN + Tailscale + remote)
HOST=all purplemux-improved

# Localhost + Tailscale only
HOST=localhost,tailscale purplemux-improved

# Custom port + verbose hook tracing
PORT=9000 LOG_LEVELS=hooks=debug purplemux-improved

# Kitchen sink for debugging
PORT=9000 HOST=localhost LOG_LEVEL=debug LOG_LEVELS=tmux=trace purplemux-improved
```

{% call callout('tip') %}
For a persistent install, set these in your launchd / systemd unit's `Environment=` block. See [Installation](/purplemux-improved/docs/installation/#start-on-boot) for an example unit file.
{% endcall %}

## What's next

- **[Installation](/purplemux-improved/docs/installation/)** — where these vars usually go.
- **[Data directory](/purplemux-improved/docs/data-directory/)** — how `port` and `cli-token` interact with hook scripts.
- **[CLI reference](/purplemux-improved/docs/cli-reference/)** — `PMUX_PORT` / `PMUX_TOKEN` in context.
