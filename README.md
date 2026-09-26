# purplemux-improved

An improved fork of [subicura/purplemux](https://github.com/subicura/purplemux). The `purplemux` / `pmux` aliases and `~/.purplemux` data directory remain compatible. npm installation requires this fork to be published; until then, run from source.

## Main improvements in this fork

These additions and enhancements build on commit [`52140216`](https://github.com/stirp/purplemux-improved/commit/52140216d8bb5bfffed30d8d452f77b88339a4ae), focusing on parallel development and the Claude Code / Codex web experience. [简体中文](README.zh-CN.md#fork-后的主要改进)

| Area | Improvements |
| --- | --- |
| **Git worktree subtasks** | Create a branch and worktree from a workspace context menu, or open “Manage Worktrees” to inspect repository worktrees and live status, add existing directories, and clean up safely. Run agents in separate directories to develop changes in parallel. |
| **Workspaces and tabs** | Browse directories and create multiple workspaces, rename tabs from their context menu, reorder workspace groups by dragging, and restore layouts for empty workspaces. |
| **Queued and immediate input** | Choose between queued and immediate submission, with queuing as the default. Messages wait while the agent is busy and are sent in order when it becomes idle; “Submit now” sends them sooner. |
| **Session history management** | Remove historical sessions from workspace lists and the global Sessions view, with an option to delete the original Claude / Codex session records. Active original sessions are protected from deletion. |
| **Interactive question cards** | Consistent styling for Claude and Codex. Codex answers submit directly without an extra composer step, preserve the selected result, and restore submitted answers from history. |
| **Native `/` command menus** | Open the current Claude / Codex CLI menu from the web composer and select commands in the expanded terminal, using commands actually available in that session. |
| **Agent status lines** | Show the status text rendered by the Claude / Codex terminal on desktop and mobile, including when the terminal is collapsed. Match it to the session and retain the latest valid text during brief redraws. |
| **Todo and plan progress** | Unified progress for Claude `TodoWrite`, `TaskCreate` / `TaskUpdate`, and Codex plans. Supports plan snapshot replacement and `tools.update_plan(...)` calls with inline lists inside `exec`. |
| **Agent startup and connection** | Fix Claude process detection through nested shells, session association, and readiness recovery. Configure environment variables for newly launched Codex processes from Settings. |
| **Attachments, translations, and development** | Improve attachment drafts and Codex message parsing, translate new controls and fix client translation loading, and configure development hot-reload origins through `PURPLEMUX_ALLOWED_DEV_ORIGINS`. |

> Status lines require actual CLI output; todo and plan displays require the corresponding tools to be available and called in the session. Removing a child workspace does not automatically delete its on-disk worktree or Git branch.

“Manage Worktrees” refreshes every 10 seconds while viewing and discovers worktrees created in a terminal. Removal checks changes, untracked and ignored files, associated Purplemux sessions, and worktree status; branches are kept by default. Optionally delete a local branch after verifying it is merged into a selected target branch. Main, locked, or unverifiable worktrees cannot be deleted directly. Upstream counts use local refs without automatic fetch.

Organization tools record explicit workspace opens, filter by inactivity (7/30/90 days), search and sort worktrees, and measure disk usage on demand. Measurements exclude shared Git data, do not follow symlinks, and show a lower bound when a scan reaches its limit. Batch cleanup previews up to 50 selections, rechecks each worktree before removal, keeps branches, and reports individual failures; the workspace hosting the panel must be removed separately.

“Sync and Deliver” compares a selected target branch, then merges or rebases it into the selected worktree without changing the target branch. Fetch is explicit. Conflicts remain visible with continue/abort actions after manual resolution. PR/MR links can be associated and refreshed through authenticated `gh` (GitHub) or `glab` (GitLab). Draft creation supports a remote, source/target branches, title and Markdown description, checks for an existing open PR/MR, and requires the current commit to be published first. A separate confirmed push sends the exact previewed commit without force. Drafts currently use branches in the same remote repository; cross-repository/fork drafts are not supported. Remote failures are shown as unknown or unconfirmed, and a successfully created link remains visible if saving its local association fails.


---

**Claude Code and Codex, many tasks at once. Faster.**

Every session on a single screen. Uninterrupted, even on your phone.

English | <a href="README.ko.md">한국어</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh-CN.md">简体中文</a> | <a href="README.zh-TW.md">繁體中文</a> | <a href="README.de.md">Deutsch</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.ru.md">Русский</a> | <a href="README.pt-BR.md">Português (Brasil)</a> | <a href="README.tr.md">Türkçe</a>

![purplemux-improved](docs/images/screenshot.png)

![purplemux-improved mobile](docs/images/screenshot-mobile.png)

## Install

```bash
npx purplemux-improved@latest
```

Open [http://localhost:8022](http://localhost:8022) in your browser. Done.

> Requires Node.js 20+ and tmux. macOS or Linux.

Prefer a native app? Grab the macOS Electron build from the [latest release](https://github.com/stirp/purplemux-improved/releases/latest) (`.dmg` for Apple Silicon & Intel).

## Why purplemux-improved

- **Multi-session dashboard** — See working/needs-input status for every Claude Code and Codex session at a glance
- **Rate limit monitoring** — 5-hour / 7-day remaining usage with reset countdown
- **Push notifications** — Desktop and mobile alerts when a task finishes or needs input
- **Mobile & multi-device** — Reach the same session from a phone, tablet, or another desktop
- **Live session view** — No more scrolling CLI output. Progress is organized as a timeline

Plus

- **Uninterrupted sessions** — Built on tmux. Close the browser and everything stays put. Reconnect and your tabs, panels, and directories are exactly where you left them
- **Self-hosted & open source** — Code and session data never leave your machine. No external servers
- **Encrypted remote access** — HTTPS from anywhere via Tailscale

## How it differs from the official Remote Control

> The official Remote Control focuses on single-session remote control. Use purplemux-improved when you need multi-session management, push notifications, and persistent sessions.

## Features

### Terminal

- **Split panels** — Horizontal / vertical splits, drag to resize
- **Tab management** — Multiple tabs, drag to reorder, auto titles from process names
- **Keyboard shortcuts** — Splits, tab switching, focus movement
- **Terminal themes** — Dark / light mode, multiple color themes
- **Workspaces & groups** — Save and restore panel layouts, tabs, and working directories. Organize workspaces into groups with drag-and-drop
- **Git workflow** — Side-by-side / line-by-line diff with syntax highlighting, inline hunk expansion, and a paginated history tab. Fetch / pull / push from the panel with ahead/behind indicators — if sync fails (dirty worktree, conflicts), Ask Claude or Codex in one click
- **Web browser panel** — Embedded browser for checking dev output (Electron). Drive it from the `purplemux-improved` CLI and switch viewports with a built-in device emulator
- **Agent tabs** — Start Claude, Codex, or a combined session list from the new-tab menu

### Claude Code and Codex integration

- **Real-time status** — Working / needs-input indicators with session switching
- **Live session view** — Messages, tool calls, tasks, permission prompts, thinking blocks
- **Codex tabs** — Launch Codex CLI sessions with the same tmux-backed persistence as Claude
- **Session list** — Browse and resume recent Claude and Codex sessions from one combined view
- **One-click resume** — Restart a paused Claude or Codex session directly from the browser
- **Auto resume** — Recover previous Claude sessions on server start
- **Quick prompts** — Register frequently used prompts and send with one click
- **Attachments** — Drop images into the chat input, or attach files to insert their paths. Works on mobile
- **Message history** — Reuse previous messages
- **Usage analytics** — Claude + Codex tokens, cost, per-project breakdowns, and daily AI reports
- **Rate limits** — 5-hour / 7-day remaining usage with reset countdown for supported providers

### Mobile & accessibility

- **Responsive UI** — Terminal and timeline on phones and tablets
- **PWA** — Add to home screen for a native-app feel
- **Web Push** — Receive notifications even after closing the tab
- **Multi-device sync** — Workspace changes reflected in real time
- **Tailscale** — HTTPS access from outside via a WireGuard-encrypted tunnel
- **Password authentication** — scrypt hashing, safe even when exposed externally
- **Multilingual** — 11 languages including 한국어, English, 日本語, 中文

## Supported platforms

| Platform | Status | Notes |
|---|---|---|
| macOS (Apple Silicon / Intel) | ✅ | Electron app included |
| Linux | ✅ | No Electron |
| Windows | ❌ | Not supported |

## Install details

### Requirements

- macOS 13+ or Linux
- [Node.js](https://nodejs.org/) 20+
- [tmux](https://github.com/tmux/tmux)

Required for Claude tabs. Install Claude Code and sign in before starting a Claude tab:

```bash
curl -fsSL https://claude.ai/install.sh | bash
# or, with Homebrew latest channel
brew install --cask claude-code@latest
```

Optional for Codex tabs. Install Codex CLI and sign in before starting a Codex tab:

```bash
npm i -g @openai/codex
# or
brew install --cask codex
```

### npx (fastest)

```bash
npx purplemux-improved@latest
```

### Global install

```bash
npm install -g purplemux-improved
purplemux-improved
```

### CLI examples

```bash
purplemux-improved tab create -w WS -t codex-cli -n "fix auth"
purplemux-improved tab create -w WS -t agent-sessions
```

### Run from source

```bash
git clone https://github.com/stirp/purplemux-improved.git
cd purplemux-improved
pnpm install
pnpm start
```

Development mode:

```bash
pnpm dev
```

For development access through custom hostnames, configure the hot reload allowlist in `.env.development.local`:

```dotenv
PURPLEMUX_ALLOWED_DEV_ORIGINS=dev.example.com,*.dev.example.com
```

Separate hostnames with commas or whitespace; omit protocols, ports, and paths. Localhost and local network interface IPs remain supported by default. Restart `pnpm dev` after changes. This file is ignored by Git. The same environment variable can also be set in the launch command.

#### Log level

Set the overall level with `LOG_LEVEL` (default `info`).

```bash
LOG_LEVEL=debug pnpm dev
```

To enable specific modules only, list `module=level` pairs in `LOG_LEVELS`, separated by commas. Available levels: `trace` / `debug` / `info` / `warn` / `error` / `fatal`.

```bash
# Trace only Claude Code hook behavior at debug
LOG_LEVELS=hooks=debug pnpm dev

# Multiple modules at once
LOG_LEVELS=hooks=debug,status=warn pnpm dev
```

Modules not listed in `LOG_LEVELS` fall back to `LOG_LEVEL`.

## Remote access (Tailscale Serve)

```bash
tailscale serve --bg 8022
```

Access at `https://<machine>.<tailnet>.ts.net`. To disable:

```bash
tailscale serve --bg off 8022
```

## Security

### Password

Set a password on first access. It is hashed with scrypt and stored in `~/.purplemux/config.json`.

To reset, delete `~/.purplemux/config.json` and restart — the onboarding screen will appear again.

### HTTPS

The default is HTTP. Always use HTTPS when exposing the app externally:

- **Tailscale Serve** — WireGuard encryption with automatic certificates
- **Nginx / Caddy** — Must forward WebSocket upgrade headers (`Upgrade`, `Connection`)

### Data directory (`~/.purplemux/`)

| File | Description |
|---|---|
| `config.json` | Authentication (hashed) and app settings |
| `workspaces.json` | Workspace layouts, tabs, directories |
| `vapid-keys.json` | Web Push VAPID keys (auto-generated) |
| `push-subscriptions.json` | Push subscription data |
| `hooks/` | User-defined hooks |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                    │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐   │
│  │  xterm.js │ │ Timeline  │ │ Status   │ │ Multi-device│   │
│  │  Terminal │ │           │ │          │ │ Sync        │   │
│  └─────┬─────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘   │
└────────┼─────────────┼────────────┼──────────────┼──────────┘
         │ws           │ws          │ws            │ws
         │/terminal    │/timeline   │/status       │/sync
         ▼             ▼            ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│  Node.js Server (:8022)                                     │
│  ┌──────────┐  ┌───────────────┐  ┌─────────────────────┐   │
│  │ node-pty │  │ JSONL Watcher │  │ Status Manager      │   │
│  │ PTY↔WS   │  │ File watch →  │  │ Process tree +      │   │
│  │ Binary   │  │ Parse → Send  │  │ JSONL tail analysis │   │
│  └────┬─────┘  └───────┬───────┘  └──────────┬──────────┘   │
└───────┼────────────────┼─────────────────────┼──────────────┘
        ▼                ▼                     ▼
┌─────────────────────────────────────────────────────────────┐
│  System                                                     │
│  tmux (purple socket)         Agent CLIs                    │
│  ┌────────┐ ┌────────┐       ┌────────────────────────────┐ │
│  │Session1│ │Session2│  ...  │ Claude Code                │ │
│  │ (shell)│ │ (shell)│       │   ~/.claude/projects/*.jsonl │ │
│  └────────┘ └────────┘       │ Codex                      │ │
│                              │   ~/.codex/sessions/*.jsonl │ │
│                              └────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Terminal I/O** — xterm.js connects to node-pty via WebSocket; node-pty attaches to tmux sessions. A binary protocol handles stdin/stdout/resize with backpressure control.

**Status detection** — Agent event hooks deliver instant updates via HTTP POST. Claude Code uses `SessionStart`, `Stop`, and `Notification`; Codex uses `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, and `PermissionRequest`. Polling every 5–15s inspects process trees and analyzes the last 8KB of JSONL files.

**Timeline** — Watches JSONL session logs under `~/.claude/projects/` and `~/.codex/sessions/`, parses new lines on change, and streams structured entries to the browser.

**tmux isolation** — Uses a dedicated `purple` socket, completely separate from your existing tmux. No prefix key, no status bar.

**Auto recovery** — On server start, restores previous Claude sessions via `claude --resume {sessionId}`. Codex sessions can be resumed from the session list or with `codex resume {sessionId}`.

## License

[MIT](LICENSE)
