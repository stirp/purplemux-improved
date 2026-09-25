---
title: Live session view
description: What the timeline panel actually shows — messages, tool calls, tasks, and prompts laid out as events instead of CLI scrollback.
eyebrow: Claude Code
permalink: /docs/live-session-view/index.html
---
{% from "docs/callouts.njk" import callout %}

When a tab is running Claude Code, purplemux-improved replaces the raw terminal view with a structured timeline. Same session, same JSONL transcript — but laid out as discrete events you can scan, scroll, and link to.

## Why a timeline beats scrollback

The Claude CLI is interactive. Watching what it did fifteen minutes ago in a terminal means scrolling past everything that's happened since, reading wrapped lines, and guessing where one tool call ends and the next begins.

The timeline keeps the same data and adds structure:

- One row per message, tool call, task, or prompt
- Tool inputs and outputs grouped together
- Permanent anchors — events don't slide off the top when the buffer fills
- The current step is always pinned at the bottom with an elapsed-time counter

You can still drop into the terminal at any point with the mode toggle on the top bar. The timeline is a view onto the same session, not a separate one.

## What you'll see

Each row in the timeline corresponds to an entry in the Claude Code JSONL transcript:

| Type | What it shows |
|---|---|
| **User message** | Your prompt as a chat bubble. |
| **Assistant message** | Claude's reply, rendered as Markdown. |
| **Tool call** | The tool name, key arguments, and the response — `read`, `edit`, `bash`, etc. |
| **Tool group** | Consecutive tool calls collapsed into one card. |
| **Task / plan** | Multi-step plans with checkbox progress. |
| **Sub-agent** | Agent invocations grouped with their own progress. |
| **Permission prompt** | The intercepted prompt with the same options Claude offers. |
| **Compacting** | A subtle indicator when Claude is auto-compacting context. |

Long assistant messages collapse to a snippet with an expand affordance; long tool outputs are truncated with a "show more" toggle.

## How it stays live

The timeline is fed by a WebSocket on `/api/timeline`. The server runs an `fs.watch` on the active JSONL file, parses appended entries, and pushes them to the browser as they happen. There is no polling and no full re-fetch — the initial payload sends the existing entries, and everything after is incremental.

While Claude is `busy`, you also see:

- A spinner with the live elapsed time for the current step
- The current tool call (e.g. "Reading src/lib/auth.ts")
- A short snippet of the most recent assistant text

These come from the JSONL watcher's metadata pass and update without changing the session state.

## Scrolling, anchors, and history

The timeline auto-scrolls when you're already at the bottom and stays put when you scroll up to read something. A floating **Scroll to bottom** button appears once you're more than a screen above the latest entry.

For long sessions, older entries load on demand as you scroll up. The Claude session ID is preserved across resumes, so picking up a session from yesterday lands you where you left off.

{% call callout('tip', 'Jump to the input') %}
Press <kbd>⌘I</kbd> from anywhere in the timeline to focus the input bar at the bottom. <kbd>Esc</kbd> sends an interrupt to the running Claude process.
{% endcall %}

## Permission prompts inline

When Claude asks to run a tool or edit a file, the prompt appears inline in the timeline rather than as a modal. You can click the option, press the matching number key, or ignore it and answer from your phone via Web Push. See [Permission prompts](/purplemux-improved/docs/permission-prompts/) for the full flow.

## Modes on a single tab

The top bar lets you switch what the right-hand panel shows for the same session:

- **Claude** — the timeline (default)
- **Terminal** — the raw xterm.js view
- **Diff** — Git changes for the working directory

Switching modes does not restart anything. The session keeps running on tmux behind all three views.

Shortcuts: <kbd>⌘⇧C</kbd> · <kbd>⌘⇧T</kbd> · <kbd>⌘⇧F</kbd>.

## What's next

- **[Permission prompts](/purplemux-improved/docs/permission-prompts/)** — the inline approval flow.
- **[Session status](/purplemux-improved/docs/session-status/)** — the badges that drive the timeline indicators.
- **[Quick prompts & attachments](/purplemux-improved/docs/quick-prompts-attachments/)** — what the input bar at the bottom can do.
