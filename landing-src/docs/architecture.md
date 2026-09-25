---
title: Architecture
description: How the browser, the Node.js server, tmux, and the Claude CLI fit together.
eyebrow: Reference
permalink: /docs/architecture/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved is three layers stitched together: a browser front-end, a Node.js server on `:8022`, and tmux + the Claude CLI on the host. Everything between them is either a binary WebSocket or a small HTTP POST.

## The three layers

```
Browser                         Node.js server (:8022)            Host
─────────                       ────────────────────────          ──────────────
xterm.js  ◀──ws /api/terminal──▶  terminal-server.ts  ──node-pty──▶ tmux (purple socket)
Timeline  ◀──ws /api/timeline──▶  timeline-server.ts                    │
Status    ◀──ws /api/status────▶  status-server.ts                      └─▶ shell ─▶ claude
Sync      ◀──ws /api/sync──────▶  sync-server.ts
                                  status-manager.ts ◀──POST /api/status/hook── status-hook.sh
                                  rate-limits-watcher.ts ◀──POST /api/status/statusline── statusline.sh
                                  JSONL watcher ──reads── ~/.claude/projects/**/*.jsonl
```

Each WebSocket has a single purpose; they don't multiplex. Authentication is a NextAuth JWT cookie verified during the WS upgrade.

## Browser

The front-end is a Next.js (Pages Router) app. The pieces that talk to the server:

| Component | Library | Purpose |
|---|---|---|
| Terminal pane | `xterm.js` | Renders bytes from `/api/terminal`. Emits keystrokes, resize events, title changes (`onTitleChange`). |
| Session timeline | React + `useTimeline` | Renders Claude turns from `/api/timeline`. No `cliState` derivation — that's all server-side. |
| Status indicators | Zustand `useTabStore` | Tab badges, sidebar dots, notification counts driven by `/api/status` messages. |
| Multi-device sync | `useSyncClient` | Watches workspace / layout edits made on another device via `/api/sync`. |

Tab titles and the foreground process come from xterm.js's `onTitleChange` event — tmux is configured (`src/config/tmux.conf`) to emit `#{pane_current_command}|#{pane_current_path}` every two seconds, and `lib/tab-title.ts` parses it.

## Node.js server

`server.ts` is a custom HTTP server that hosts Next.js plus four `ws` `WebSocketServer` instances on the same port.

### WebSocket endpoints

| Path | Handler | Direction | Use |
|---|---|---|---|
| `/api/terminal` | `terminal-server.ts` | bidirectional, binary | Terminal I/O via `node-pty` attached to a tmux session |
| `/api/timeline` | `timeline-server.ts` | server → client | Streams Claude session entries parsed from JSONL |
| `/api/status` | `status-server.ts` | bidirectional, JSON | `status:sync` / `status:update` / `status:hook-event` from server, `status:tab-dismissed` / `status:ack-notification` / `status:request-sync` from client |
| `/api/sync` | `sync-server.ts` | bidirectional, JSON | Cross-device workspace state |

Plus `/api/install` for the first-run installer (no auth required).

### Terminal binary protocol

`/api/terminal` uses a tiny binary protocol defined in `src/lib/terminal-protocol.ts`:

| Code | Name | Direction | Payload |
|---|---|---|---|
| `0x00` | `MSG_STDIN` | client → server | Key bytes |
| `0x01` | `MSG_STDOUT` | server → client | Terminal output |
| `0x02` | `MSG_RESIZE` | client → server | `cols: u16, rows: u16` |
| `0x03` | `MSG_HEARTBEAT` | both | 30 s interval, 90 s timeout |
| `0x04` | `MSG_KILL_SESSION` | client → server | End the underlying tmux session |
| `0x05` | `MSG_WEB_STDIN` | client → server | Web input bar text (delivered after copy-mode exit) |

Backpressure: `pty.pause` when WS `bufferedAmount > 1 MB`, resume below `256 KB`. At most 32 concurrent connections per server, with the oldest dropped beyond that.

### Status manager

`src/lib/status-manager.ts` is the single source of truth for `cliState`. Hook events flow through `/api/status/hook` (token-authenticated POST), get sequenced (`eventSeq` per tab), and are reduced into `idle` / `busy` / `needs-input` / `ready-for-review` / `unknown` by `deriveStateFromEvent`. The JSONL watcher updates only metadata except for one synthetic `interrupt` event.

For the full state machine see [Session status (STATUS.md)](https://github.com/stirp/purplemux-improved/blob/main/docs/STATUS.md).

## tmux layer

purplemux-improved runs an isolated tmux on a dedicated socket — `-L purple` — using its own config at `src/config/tmux.conf`. Your `~/.tmux.conf` is never read.

Sessions are named `pt-{workspaceId}-{paneId}-{tabId}`. One terminal pane in the browser maps to one tmux session, attached via `node-pty`.

```
tmux socket: purple
├── pt-ws-MMKl07-pa-1-tb-1   ← browser tab 1
├── pt-ws-MMKl07-pa-1-tb-2   ← browser tab 2
└── pt-ws-MMKl07-pa-2-tb-1   ← split pane, tab 1
```

`prefix` is disabled, the status bar is off (xterm.js draws the chrome), `set-titles` is on, and `mouse on` puts the wheel into copy-mode. tmux is the reason sessions survive a closed browser, a Wi-Fi drop, or a server restart.

For the full tmux setup, command wrapper, and process detection details see [tmux & process detection (TMUX.md)](https://github.com/stirp/purplemux-improved/blob/main/docs/TMUX.md).

## Claude CLI integration

purplemux-improved doesn't fork or wrap Claude — the `claude` binary is just whatever you have installed. Two things get added:

1. **Hook settings** — At startup, `ensureHookSettings()` writes `~/.purplemux/hooks.json`, `status-hook.sh`, and `statusline.sh`. Every Claude tab launches with `--settings ~/.purplemux/hooks.json`, so `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop`, `PreCompact`, `PostCompact` all POST back to the server.
2. **JSONL reads** — `~/.claude/projects/**/*.jsonl` is parsed by `timeline-server.ts` for the live conversation view, and watched by `session-detection.ts` to detect a running Claude process via the PID files at `~/.claude/sessions/`.

Hook scripts read `~/.purplemux/port` and `~/.purplemux/cli-token` and POST with `x-pmux-token`. They fail silently if the server is down, so closing purplemux-improved while Claude is running doesn't crash anything.

## Startup sequence

`server.ts:start()` runs through these in order:

1. `acquireLock(port)` — single-instance guard via `~/.purplemux/pmux.lock`
2. `initConfigStore()` + `initShellPath()` (resolves the user's login shell `PATH`)
3. `initAuthCredentials()` — load scrypt-hashed password and HMAC secret into env
4. `scanSessions()` + `applyConfig()` — clean up dead tmux sessions, apply `tmux.conf`
5. `initWorkspaceStore()` — load `workspaces.json` and per-workspace `layout.json`
6. `autoResumeOnStartup()` — relaunch shells in saved directories, attempt Claude resume
7. `getStatusManager().init()` — start the metadata poll
8. `app.prepare()` (Next.js dev) or `require('.next/standalone/server.js')` (prod)
9. `listenWithFallback()` on `bindPlan.host:port` (`0.0.0.0` or `127.0.0.1` based on access policy)
10. `ensureHookSettings(result.port)` — write or refresh hook scripts with the actual port
11. `getCliToken()` — read or generate `~/.purplemux/cli-token`
12. `writeAllClaudePromptFiles()` — refresh each workspace's `claude-prompt.md`

The window between port resolution and step 10 is why hook scripts are regenerated on every startup: they need the live port baked in.

## Custom server vs. Next.js module graph

{% call callout('warning', 'Two module graphs in one process') %}
The outer custom server (`server.ts`) and Next.js (pages + API routes) share a Node process but **not** their module graphs. Anything under `src/lib/*` imported from both sides is instantiated twice. Singletons that need to be shared (the StatusManager, WebSocket client sets, the CLI token, file-write locks) hang off `globalThis.__pt*` keys. See `CLAUDE.md §18` for the full rationale.
{% endcall %}

## Where to read more

- [`docs/TMUX.md`](https://github.com/stirp/purplemux-improved/blob/main/docs/TMUX.md) — tmux config, command wrapper, process tree walking, terminal binary protocol.
- [`docs/STATUS.md`](https://github.com/stirp/purplemux-improved/blob/main/docs/STATUS.md) — Claude CLI state machine, hook flow, synthetic interrupt event, JSONL watcher.
- [`docs/DATA-DIR.md`](https://github.com/stirp/purplemux-improved/blob/main/docs/DATA-DIR.md) — every file purplemux-improved writes.

## What's next

- **[Data directory](/purplemux-improved/docs/data-directory/)** — every file the architecture above touches.
- **[CLI reference](/purplemux-improved/docs/cli-reference/)** — talking to the server from outside the browser.
- **[Troubleshooting](/purplemux-improved/docs/troubleshooting/)** — diagnosing it when something here misbehaves.
