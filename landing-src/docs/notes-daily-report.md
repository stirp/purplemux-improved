---
title: Notes (AI daily report)
description: An end-of-day summary of every Claude Code session, written by an LLM, stored locally as Markdown.
eyebrow: Claude Code
permalink: /docs/notes-daily-report/index.html
---
{% from "docs/callouts.njk" import callout %}

When the day is over, purplemux-improved can read the day's session logs and write you a one-line brief plus a per-project Markdown summary. It lives in the sidebar as **Notes** and exists so retros, standups, and 1:1s stop starting with "what did I do yesterday?"

## What you get per day

Each entry has two layers:

- **One-line brief** — a single sentence that captures the shape of the day. Visible directly in the Notes list.
- **Detailed view** — expand the brief to see a Markdown report grouped by project, with H3 sections for each topic and bulleted highlights underneath.

The brief is what you scan; the detailed view is what you paste into a retro doc.

A small header on each day shows the session count and total cost — the same numbers the [stats dashboard](/purplemux-improved/docs/usage-rate-limits/) uses, in summary form.

## Generating a report

Reports are generated on demand, not automatically. From the Notes view:

- **Generate** next to a missing day creates that day's report from the JSONL transcripts.
- **Regenerate** on an existing entry rebuilds the same day with fresh content (useful if you've added context or switched languages).
- **Generate all** walks through every missing day and fills them in sequentially. You can stop the batch at any time.

The LLM processes each session individually before merging them by project, so context isn't lost across long days with many tabs.

{% call callout('note', 'Locale follows the app') %}
Reports are written in the language purplemux-improved is set to. Switching the app language and regenerating gives you the same content in the new locale.
{% endcall %}

## Where it lives

| Surface | Path |
|---|---|
| Sidebar | **Notes** entry, opens the list view |
| Shortcut | <kbd>⌘⇧E</kbd> on macOS, <kbd>Ctrl⇧E</kbd> on Linux |
| Storage | `~/.purplemux/stats/daily-reports/<date>.json` |

Each day is one JSON file containing the brief, the detailed Markdown, the locale, and the session metadata. Nothing leaves your machine except the LLM call itself, which goes through whatever Claude Code account is configured on the host.

## Per-project structure

Inside the detailed view, a typical day looks like:

```markdown
**purplemux-improved**

### Landing page draft
- Designed the eight-section structure with Hero / Why / Mobile / Stats layouts
- Made the purple brand color an OKLCH variable
- Applied desktop / mobile screenshot mockup frames

### Feature card mockups
- Reproduced real spinner / pulse indicators on the multi-session dashboard
- Tightened Git Diff, workspace, and self-hosted mockup CSS
```

Sessions that worked in the same project are merged under one project heading; topics within a project become H3 sections. You can copy the rendered Markdown straight into a retro template.

## When days don't make sense to summarize

A day with no Claude sessions doesn't get an entry. A day with one tiny session may produce a very short brief — that's fine; it'll regenerate longer next time you actually do work.

The batch generator skips days that already have a report in the current locale and only fills genuine gaps.

## Privacy

The text used to build a report is the same JSONL transcripts you can read yourself in `~/.claude/projects/`. The summarization request is a single LLM call per day; the cached output stays under `~/.purplemux/`. There is no telemetry, no upload, no shared cache.

## What's next

- **[Usage & rate limits](/purplemux-improved/docs/usage-rate-limits/)** — the dashboard those session counts and costs come from.
- **[Live session view](/purplemux-improved/docs/live-session-view/)** — the source data, in real time.
- **[Keyboard shortcuts](/purplemux-improved/docs/keyboard-shortcuts/)** — including <kbd>⌘⇧E</kbd> for Notes.
