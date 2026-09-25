---
title: Save & restore layouts
description: Why your tabs come back exactly where you left them, even after a server reboot.
eyebrow: Workspaces & Terminal
permalink: /docs/save-restore/index.html
---
{% from "docs/callouts.njk" import callout %}

purplemux-improved is built around the idea that closing a tab in your browser shouldn't end a session. Two pieces work together: tmux keeps the shells running, and `~/.purplemux/workspaces.json` remembers the layout.

## What gets persisted

Anything you can see in a workspace:

- Tabs and their order
- Pane splits and their ratios
- Each tab's panel type — Terminal, Claude, Diff, Web browser
- Working directory of every shell
- Workspace groups, names, and order

`workspaces.json` is updated transactionally on every layout change, so the file always reflects the current state. See [Data directory](/purplemux-improved/docs/data-directory/) for the on-disk file map.

## Closing the browser

Close the tab, refresh, or shut your laptop. None of it kills sessions.

Each shell lives in a tmux session on the dedicated `purple` socket — fully isolated from your personal `~/.tmux.conf`. Reopen `http://localhost:8022` an hour later and the WebSocket reattaches to the same tmux session, replays the scrollback, and hands the live PTY back to xterm.js.

You don't restore anything; you reconnect.

{% call callout('tip', 'Mobile too') %}
The same applies on your phone. Close the PWA, lock the device, come back tomorrow — the dashboard reattaches with everything in place.
{% endcall %}

## Recovering after a server reboot

A reboot does kill the tmux processes — they're just OS processes. purplemux-improved handles this on next start:

1. **Read the layout** — `workspaces.json` describes every workspace, pane, and tab.
2. **Recreate sessions in parallel** — for each tab, a new tmux session is spawned in its saved working directory.
3. **Auto-resume Claude** — tabs that had a Claude session running are restarted with `claude --resume {sessionId}` so the conversation picks up where it left off.

The "parallel" part matters: if you had ten tabs, all ten tmux sessions come up at once instead of one after another. By the time you open the browser, the layout is already there.

## What doesn't come back

A handful of things can't be persisted:

- **In-memory shell state** — environment variables you set, background jobs, REPLs in the middle of a thought.
- **Permission prompts in flight** — if Claude was waiting on a permission decision when the server died, you'll see the prompt again on resume.
- **Foreground processes other than `claude`** — `vim` buffers, `htop`, `docker logs -f`. The shell is back in the same directory; the process is not.

This is the standard tmux contract: the shell survives, processes inside it don't necessarily.

## Manual control

You don't normally need to touch this, but for the curious:

- The tmux socket is named `purple`. Inspect with `tmux -L purple ls`.
- Sessions are named `pt-{workspaceId}-{paneId}-{tabId}`.
- Editing `workspaces.json` while purplemux-improved is running is unsafe — the server holds it open and writes through.

For the deeper story (binary protocol, backpressure, JSONL watching) see [How it works](/purplemux-improved/#how) on the landing page.

## What's next

- **[Workspaces & groups](/purplemux-improved/docs/workspaces-groups/)** — what gets saved per workspace.
- **[Tabs & panes](/purplemux-improved/docs/tabs-panes/)** — what gets saved per tab.
- **[Browser support](/purplemux-improved/docs/browser-support/)** — known quirks around mobile background tabs and reconnects.
