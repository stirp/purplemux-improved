---
title: Session status
description: How purplemux-improved turns Claude Code activity into a four-state badge — and why it updates near-instantly.
eyebrow: Claude Code
permalink: /docs/session-status/index.html
---
{% from "docs/callouts.njk" import callout %}

Every session in the sidebar carries a colored dot that tells you, at a glance, what Claude is doing. This page explains where those four states come from and how they stay in sync without you reaching for the terminal.

## The four states

| State | Indicator | Meaning |
|---|---|---|
| **Idle** | none / gray | Claude is waiting for your next prompt. |
| **Busy** | purple spinner | Claude is processing — reading, editing, running tools. |
| **Needs input** | amber pulse | A permission prompt or question is waiting on you. |
| **Review** | purple pulse | Claude finished and there's something for you to check. |

A fifth value, **unknown**, briefly appears for tabs that were `busy` when the server restarted. It resolves on its own once purplemux-improved can re-verify the session.

## Hooks are the source of truth

purplemux-improved installs a Claude Code hook configuration at `~/.purplemux/hooks.json` and a tiny shell script at `~/.purplemux/status-hook.sh`. The script is registered for five Claude Code hook events and POSTs each one to the local server with a CLI token:

| Claude Code hook | Resulting state |
|---|---|
| `SessionStart` | idle |
| `UserPromptSubmit` | busy |
| `Notification` (permission only) | needs-input |
| `Stop` / `StopFailure` | review |
| `PreCompact` / `PostCompact` | shows the compacting indicator (state unchanged) |

Because hooks fire the moment Claude Code transitions, the sidebar updates before you'd notice in the terminal.

{% call callout('note', 'Permission notifications only') %}
Claude's `Notification` hook fires for several reasons. purplemux-improved only flips to **needs-input** when the notification is `permission_prompt` or `worker_permission_prompt`. Idle nudges and other notification types don't trigger the badge.
{% endcall %}

## Process detection runs in parallel

Whether the Claude CLI is actually running is tracked separately from the work state. Two paths cooperate:

- **tmux title changes** — every pane reports `pane_current_command|pane_current_path` as its title. xterm.js delivers the change via `onTitleChange`, and purplemux-improved pings `/api/check-claude` to confirm.
- **Process tree walk** — server-side, `detectActiveSession` looks at the pane's shell PID, walks its children, and matches against the PID files Claude writes under `~/.claude/sessions/`.

If the directory doesn't exist, the UI shows a "Claude not installed" screen instead of a status dot.

## The JSONL watcher fills the gaps

Claude Code writes a transcript JSONL for each session under `~/.claude/projects/`. While a tab is `busy`, `needs-input`, `unknown`, or `ready-for-review`, purplemux-improved watches that file with `fs.watch` for two reasons:

- **Metadata** — current tool, last assistant snippet, token counts. These flow into the timeline and sidebar without changing the state.
- **Synthetic interrupt** — when you press Esc mid-stream, Claude writes `[Request interrupted by user]` into the JSONL but fires no hook. The watcher detects that line and synthesizes an `interrupt` event so the tab returns to idle instead of getting stuck on busy.

## Polling is a safety net, not the engine

A metadata poll runs every 30–60 seconds depending on tab count. It does **not** decide state — that's strictly the hook path. The poll exists to:

- Discover new tmux panes
- Recover any session that has been busy for over 10 minutes with a dead Claude process
- Refresh process info, ports, and titles

This is the "5–15s fallback polling" mentioned on the landing page, slowed and narrowed once hooks proved reliable.

## Surviving a server restart

Hooks can't fire while purplemux-improved is down, so any state in flight could go stale. The recovery rule is conservative:

- Persisted `busy` becomes `unknown` and is re-checked: if Claude is no longer running, the tab silently flips to idle; if the JSONL trails off cleanly, it becomes review.
- Every other state — `idle`, `needs-input`, `ready-for-review` — has the ball in your court, so it persists untouched.

No automatic state changes during recovery push notifications. You only get pinged when *new* work crosses into needs-input or review.

## Where the state shows up

- Sidebar session row dot
- Tab-bar dot in each pane
- Workspace dot (highest-priority state across the workspace)
- Bell icon counts and the notification sheet
- Browser tab title (counts attention items)
- Web Push and desktop notifications for `needs-input` and `ready-for-review`

## What's next

- **[Permission prompts](/purplemux-improved/docs/permission-prompts/)** — the workflow behind the **needs-input** state.
- **[Live session view](/purplemux-improved/docs/live-session-view/)** — what the timeline shows once a tab is `busy`.
- **[First session](/purplemux-improved/docs/first-session/)** — the dashboard tour, in context.
