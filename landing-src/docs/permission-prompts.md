---
title: Permission prompts
description: How purplemux-improved intercepts Claude Code's "may I run this?" dialogs and lets you approve from the dashboard, the keyboard, or your phone.
eyebrow: Claude Code
permalink: /docs/permission-prompts/index.html
---
{% from "docs/callouts.njk" import callout %}

Claude Code blocks on permission dialogs by default — for tool calls, file writes, and similar. purplemux-improved catches those dialogs the moment they appear and routes them to whatever device you happen to be near.

## What gets intercepted

Claude Code fires a `Notification` hook for several reasons. purplemux-improved only treats two notification types as permission prompts:

- `permission_prompt` — the standard "Allow this tool to run?" dialog
- `worker_permission_prompt` — the same thing from a sub-agent

Anything else (idle reminders, etc.) is ignored on the status side and won't flip the tab to **needs-input** or send a push.

## What happens when one fires

1. Claude Code emits a `Notification` hook. The shell script at `~/.purplemux/status-hook.sh` POSTs the event and notification type to the local server.
2. The server flips the tab's state to **needs-input** (amber pulse) and broadcasts the change over the status WebSocket.
3. The dashboard renders the prompt **inline in the timeline**, with the same options Claude offered — no modal, no context switch.
4. If you've granted notification permission, a Web Push and / or desktop notification fires for `needs-input`.

The Claude CLI itself is still waiting on stdin. purplemux-improved is reading the prompt's options from tmux and forwarding your choice back when you pick one.

## How to answer

Three equivalent ways:

- **Click** the option in the timeline.
- **Press the number** — <kbd>1</kbd>, <kbd>2</kbd>, <kbd>3</kbd> — matching the option index.
- **Tap the push** on your phone, which deep-links straight to the prompt; pick from there.

Once you select, purplemux-improved sends the input to tmux, the tab transitions back to **busy**, and Claude resumes mid-stream. You don't need to acknowledge anything else — the click *is* the acknowledgement.

{% call callout('tip', 'Consecutive prompts re-fetch automatically') %}
If Claude asks several questions in a row, the inline prompt re-renders with the new options as soon as the next `Notification` arrives. You don't need to dismiss the previous one.
{% endcall %}

## Mobile flow

With the PWA installed and notifications granted, Web Push fires whether the browser tab is open, in the background, or closed:

- The notification reads "Input Required" and identifies the session.
- Tapping it opens purplemux-improved focused on that tab.
- The inline prompt is already rendered; pick an option with one tap.

This is the main reason to set up [Tailscale + PWA](/purplemux-improved/docs/quickstart/#reach-it-from-your-phone) — it lets approvals follow you off the desk.

## When the options can't be parsed

In rare cases (a prompt that scrolled out of the tmux scrollback before purplemux-improved could read it), the options list comes back empty. The timeline shows a "couldn't read the prompt" card and retries up to four times with backoff. If it still fails, switch to the **Terminal** mode for that tab and answer in the raw CLI — the underlying Claude process is still waiting.

## What about idle nudges?

Claude's other notification types — for example, idle reminders — still arrive at the hook endpoint. The server logs them but does not change tab state, send a push, or surface a UI prompt. This is intentional: only events that *block* Claude need your attention.

## What's next

- **[Session status](/purplemux-improved/docs/session-status/)** — what the **needs-input** state means and how it's detected.
- **[Live session view](/purplemux-improved/docs/live-session-view/)** — where the inline prompt is rendered.
- **[Browser support](/purplemux-improved/docs/browser-support/)** — Web Push requirements (especially iOS Safari 16.4+).
