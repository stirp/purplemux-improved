---
title: Quick prompts & attachments
description: A saved prompt library, drag-drop images, file attachments, and a reusable message history — all from the input bar at the bottom of the timeline.
eyebrow: Claude Code
permalink: /docs/quick-prompts-attachments/index.html
---
{% from "docs/callouts.njk" import callout %}

The input bar under the timeline is more than a textarea. It's where saved prompts, attachments, and message history live, so the things you type ten times a day stop costing you ten typings a day.

## Quick prompts

Quick prompts are short, named entries stored in `~/.purplemux/quick-prompts.json`. They appear as chips above the input bar — one click sends the prompt as if you typed it.

Two built-ins ship out of the box and can be disabled at any time:

- **Commit** — runs `/commit-commands:commit`
- **Simplify** — runs `/simplify`

Add your own from **Settings → Quick prompts**:

1. Click **Add prompt**.
2. Give it a name (the chip label) and a body (what gets sent).
3. Drag to reorder. Toggle off to hide without deleting.

Anything you type in the body is sent verbatim — including slash commands, multi-line prompts, or templated requests like "Explain the file open in the editor and suggest one improvement."

{% call callout('tip', 'Slash commands count') %}
Quick prompts work nicely as one-click triggers for Claude Code slash commands. A "Review this PR" chip pointing at `/review` saves a few keystrokes every time.
{% endcall %}

## Drag and drop images

Drop an image file (PNG, JPG, WebP, etc.) anywhere on the input bar to attach it. purplemux-improved uploads the file to a temp path on the server and inserts a reference into your prompt automatically.

You can also:

- **Paste** an image directly from the clipboard
- **Click the paperclip** to pick from a file dialog
- Attach **up to 20 files** per message

A thumbnail strip appears above the input while attachments are pending. Each thumbnail has an X to remove it before sending.

## Other file attachments

The same paperclip works for non-image files too — markdown, JSON, CSV, source files, anything. purplemux-improved puts them in a temp directory and inserts the path so Claude can `read` them as part of the request.

This is the easiest way to share something Claude can't reach by itself, like a stack trace pasted from another machine or a config file from a different project.

## Mobile-friendly

Attachments and the paperclip are full-size on phones. Drop a screenshot from the iOS share sheet, or use the camera button (Android) to attach a photo straight from the camera roll.

The input bar reflows for narrow screens — the chips become a horizontal scroller, the textarea grows up to five lines before scrolling.

## Message history

Every prompt you've sent in a workspace is kept in a per-workspace history. To reuse one:

- Press <kbd>↑</kbd> in an empty input bar to step through recent messages
- Or open the **History** picker for a searchable list

Old entries can be deleted from the picker. History is stored alongside other workspace data under `~/.purplemux/`, never sent off-machine.

## Keyboard

| Key | Action |
|---|---|
| <kbd>⌘I</kbd> | Focus the input from anywhere in the session view |
| <kbd>Enter</kbd> | Send |
| <kbd>⇧Enter</kbd> | Insert a newline |
| <kbd>Esc</kbd> | While Claude is busy, send an interrupt |
| <kbd>↑</kbd> | Step back through message history (when empty) |

## What's next

- **[Live session view](/purplemux-improved/docs/live-session-view/)** — where your prompts and Claude's replies show up.
- **[Keyboard shortcuts](/purplemux-improved/docs/keyboard-shortcuts/)** — the full binding table.
- **[Permission prompts](/purplemux-improved/docs/permission-prompts/)** — what happens after you send a request that needs approval.
