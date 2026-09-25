---
title: Troubleshooting & FAQ
description: Common issues, quick answers, and the questions that come up most often.
eyebrow: Reference
permalink: /docs/troubleshooting/index.html
---
{% from "docs/callouts.njk" import callout %}

If something here doesn't match what you're seeing, please [open an issue](https://github.com/stirp/purplemux-improved/issues) with your platform, browser, and the relevant log file from `~/.purplemux/logs/`.

## Install & startup

### `tmux: command not found`

purplemux-improved needs tmux 3.0+ on the host. Install it:

```bash
# macOS (Homebrew)
brew install tmux

# Ubuntu / Debian
sudo apt install tmux

# Fedora
sudo dnf install tmux
```

Verify with `tmux -V`. tmux 2.9+ technically passes the preflight check, but 3.0+ is what we test against.

### `node: command not found` or "Node.js 20 or newer"

Install Node 20 LTS or later. Check with `node -v`. The native macOS app bundles its own Node, so this only applies to the `npx` / `npm install -g` paths.

### "purplemux-improved is already running (pid=…, port=…)"

Another purplemux-improved instance is alive and answering on `/api/health`. Either use that one (open the printed URL) or stop it first:

```bash
# find it
ps aux | grep purplemux-improved

# or just kill it via the lock file
kill $(jq -r .pid ~/.purplemux/pmux.lock)
```

### Stale lock — refuses to start, but no process is running

`~/.purplemux/pmux.lock` is left behind. Remove it:

```bash
rm ~/.purplemux/pmux.lock
```

If you ever ran purplemux-improved with `sudo`, the file may be owned by root — `sudo rm` it once.

### `Port 8022 is in use, finding an available port...`

Another process owns `8022`. The server falls back to a random free port and prints the new URL. To pick the port yourself:

```bash
PORT=9000 purplemux-improved
```

Find what's holding `8022` with `lsof -iTCP:8022 -sTCP:LISTEN -n -P`.

### Does it work on Windows?

**Not officially.** purplemux-improved relies on `node-pty` and tmux, neither of which run natively on Windows. WSL2 usually works (you're effectively on Linux at that point) but it's outside our test matrix.

## Sessions & restore

### Closing the browser killed everything

It shouldn't — tmux holds every shell open on the server. If a refresh doesn't bring tabs back:

1. Check that the server is still running (`http://localhost:8022/api/health`).
2. Check that the tmux sessions exist: `tmux -L purple ls`.
3. Look at `~/.purplemux/logs/purplemux.YYYY-MM-DD.N.log` for errors during `autoResumeOnStartup`.

If tmux says "no server running", the host rebooted or something killed tmux. Sessions are gone, but the layout (workspaces, tabs, working directories) is preserved in `~/.purplemux/workspaces/{wsId}/layout.json` and gets re-launched on the next purplemux-improved start.

### A Claude session won't resume

`autoResumeOnStartup` re-runs the saved `claude --resume <uuid>` for each tab, but if the corresponding `~/.claude/projects/.../sessionId.jsonl` no longer exists (deleted, archived, or the project moved) the resume will fail. Open the tab and start a new conversation.

### My tabs all show "unknown"

`unknown` means a tab was `busy` before a server restart and recovery is still in progress. `resolveUnknown` runs in the background and confirms `idle` (Claude exited) or `ready-for-review` (final assistant message present). If a tab is stuck in `unknown` for more than ten minutes, the **busy stuck safety net** silently flips it to `idle`. See [STATUS.md](https://github.com/stirp/purplemux-improved/blob/main/docs/STATUS.md) for the full state machine.

## Browser & UI

### Web Push notifications never fire

Walk through this checklist:

1. **iOS Safari ≥ 16.4 only.** Earlier iOS doesn't have Web Push at all.
2. **Must be a PWA on iOS.** Tap **Share → Add to Home Screen** first; push won't fire from a regular Safari tab.
3. **HTTPS required.** Self-signed certs do not work — Web Push silently refuses to register. Use Tailscale Serve (free Let's Encrypt) or a real domain behind Nginx / Caddy.
4. **Notification permission granted.** **Settings → Notification → On** in purplemux-improved *and* the browser-level permission must both be allowed.
5. **Subscriptions exist.** `~/.purplemux/push-subscriptions.json` should have an entry for the device. If empty, re-grant permission.

See [Browser support](/purplemux-improved/docs/browser-support/) for the full compatibility matrix.

### iOS Safari 16.4+ but still no notifications

Some iOS versions lose the subscription after a long PWA-closed period. Open the PWA, deny then re-grant notification permission, and check `push-subscriptions.json` again.

### Safari private window doesn't persist anything

IndexedDB is disabled in Safari 17+ private windows, so the workspace cache won't survive a restart. Use a regular window.

### Mobile terminal disappears after backgrounding

iOS Safari tears down the WebSocket after about 30 s of being backgrounded. tmux keeps the actual session alive — when you return to the tab, purplemux-improved reconnects and re-renders. This is iOS, not us.

### Firefox + Tailscale serve = certificate warning

If your tailnet uses a custom domain that isn't `*.ts.net`, Firefox is pickier about HTTPS trust than Chrome. Accept the certificate once and it sticks.

### "Browser too old" or features missing

Run **Settings → Browser check** for a per-API report. Anything below the minimums in [Browser support](/purplemux-improved/docs/browser-support/) loses features gracefully but isn't supported.

## Network & remote access

### Can I expose purplemux-improved to the internet?

You can, but always over HTTPS. Recommended:

1. **Tailscale Serve** — `tailscale serve --bg 8022` gives WireGuard encryption + automatic certificates. No port forwarding needed.
2. **Reverse proxy** — Nginx / Caddy / Traefik. Make sure to forward the `Upgrade` and `Connection` headers, otherwise WebSockets break.

Plain HTTP over the open internet is a bad idea — the auth cookie is HMAC-signed but the WebSocket payloads (terminal bytes!) aren't encrypted.

### Other devices on my LAN can't reach purplemux-improved

By default purplemux-improved only allows localhost. Open up access via env or in-app settings:

```bash
HOST=lan,localhost purplemux-improved       # LAN-friendly
HOST=tailscale,localhost purplemux-improved # tailnet-friendly
HOST=all purplemux-improved                 # everything
```

Or **Settings → Network access** in the app, which writes to `~/.purplemux/config.json`. (When `HOST` is set via env, that field is locked.) See [Ports & env vars](/purplemux-improved/docs/ports-env-vars/) for keyword and CIDR syntax.

### Reverse-proxy WebSocket issues

If `/api/terminal` connects then drops immediately, the proxy is stripping `Upgrade` / `Connection` headers. Minimal Nginx:

```nginx
location / {
  proxy_pass http://127.0.0.1:8022;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
}
```

Caddy: WebSocket forwarding is the default; just `reverse_proxy 127.0.0.1:8022`.

## Data & storage

### Where is my data?

Everything is local under `~/.purplemux/`. Nothing leaves your machine. The login password is a scrypt hash in `config.json`. See [Data directory](/purplemux-improved/docs/data-directory/) for the full layout.

### I forgot my password

Delete `~/.purplemux/config.json` and restart. Onboarding starts over. Workspaces, layouts, and history are kept (they're separate files).

### Tab indicator stuck on "busy" forever

The `busy stuck safety net` flips a tab silently to `idle` after ten minutes if the Claude process has died. If you'd rather not wait, close and reopen the tab — that resets local state and the next hook event will resume from a clean slate. For root-cause investigation, run with `LOG_LEVELS=hooks=debug,status=debug`.

### Does it conflict with my existing tmux config?

No. purplemux-improved runs an isolated tmux on a dedicated socket (`-L purple`) with its own config (`src/config/tmux.conf`). Your `~/.tmux.conf` and any existing tmux sessions are untouched.

## Cost & usage

### Does purplemux-improved save me money?

It doesn't directly. What it does is **make usage transparent**: today / month / per-project cost, per-model token breakdowns, and 5h / 7d rate-limit countdowns are all on one screen so you can pace yourself before you hit a wall.

### Is purplemux-improved itself paid?

No. purplemux-improved is MIT-licensed open source. Claude Code usage is billed by Anthropic separately.

### Is my data sent anywhere?

No. purplemux-improved is fully self-hosted. The only network calls it makes are to your local Claude CLI (which talks to Anthropic on its own) and the version check via `update-notifier` on launch. Disable the version check with `NO_UPDATE_NOTIFIER=1`.

## What's next

- **[Browser support](/purplemux-improved/docs/browser-support/)** — detailed compatibility matrix and known browser quirks.
- **[Data directory](/purplemux-improved/docs/data-directory/)** — what each file does and what's safe to delete.
- **[Architecture](/purplemux-improved/docs/architecture/)** — how the parts fit together when something needs deeper digging.
