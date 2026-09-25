---
title: Usage & rate limits
description: Real-time 5-hour and 7-day rate-limit countdowns in the sidebar, plus a stats dashboard for tokens, cost, and project breakdowns.
eyebrow: Claude Code
permalink: /docs/usage-rate-limits/index.html
---
{% from "docs/callouts.njk" import callout %}

Hitting a rate limit mid-task is the worst kind of interruption. purplemux-improved pulls Claude Code's quota numbers into the sidebar and adds a stats dashboard so you can see your usage rhythm at a glance.

## The sidebar widget

Two thin bars sit at the bottom of the sidebar: **5h** and **7d**. Each shows:

- The percentage of the window you've consumed
- The time remaining until reset
- A faint projection bar for where you'll land if you keep your current pace

Hover any bar for the full breakdown — used percentage, projected percentage, and reset time as a relative duration.

The numbers come from Claude Code's own statusline JSON. purplemux-improved installs a tiny `~/.purplemux/statusline.sh` script that posts the data to the local server every time Claude refreshes its statusline; an `fs.watch` keeps the UI in sync.

## Color thresholds

Both bars shift color based on the percentage used:

| Used | Color |
|---|---|
| 0–49 % | teal — comfortable |
| 50–79 % | amber — pace yourself |
| 80–100 % | red — about to hit the wall |

The thresholds match the landing-page rate-limit widget. Once you've seen amber a few times, the sidebar becomes a peripheral pacing tool — you stop noticing it consciously, but you start spreading work across windows.

{% call callout('tip', 'Projection beats percentage') %}
The faint bar behind the solid one is a projection — if you keep going at the current rate, this is where you'll be at reset time. Watching the projection cross 80 % long before the actual usage does is the cleanest early warning.
{% endcall %}

## The stats dashboard

Open the dashboard from the sidebar (or with <kbd>⌘⇧U</kbd>). Five sections, top to bottom:

### Overview cards

Four cards: **Total sessions**, **Total cost**, **Today's cost**, **This month's cost**. Each card shows the change vs. the previous period in green or red.

### Token usage by model

A stacked bar chart per day, broken down by model and by token type — input, output, cache reads, cache writes. The model legend uses Claude's display names (Opus / Sonnet / Haiku) and the same color treatment as the sidebar bars.

This is the easiest place to see, for example, that an unexpected cost spike was an Opus-heavy day, or that cache reads are doing most of the work.

### Per-project breakdown

A table of every Claude Code project (working directory) you've used, with sessions, messages, tokens, and cost. Click a row to see a per-day chart for that project alone.

Useful for shared machines or for separating client work from personal hacks.

### Activity & streaks

A 30-day daily activity area chart, plus four streak metrics:

- **Longest streak** — your record run of consecutive working days
- **Current streak** — how many days you've worked in a row right now
- **Total active days** — count over the period
- **Average sessions per day**

### Weekly timeline

A day × hour grid showing when you actually used Claude in the last week. Concurrent sessions stack visually, so a "five sessions at 3pm" Tuesday is easy to spot.

## Where the data comes from

Everything in the dashboard is computed locally from Claude Code's own session JSONLs under `~/.claude/projects/`. purplemux-improved reads them, caches the parsed counts in `~/.purplemux/stats/`, and never sends a byte off-machine. Switching languages or regenerating the cache won't reach out anywhere.

## Reset behavior

The 5-hour and 7-day windows are rolling and tied to your Claude Code account. When a window resets, the bar drops to 0 % and the percentage and remaining time recompute from the next reset timestamp. If purplemux-improved missed the reset (server was off), the widget self-corrects on the next statusline tick.

## What's next

- **[Notes (AI daily report)](/purplemux-improved/docs/notes-daily-report/)** — same data, written up as a per-day brief.
- **[Session status](/purplemux-improved/docs/session-status/)** — the other thing the sidebar tracks per tab.
- **[Keyboard shortcuts](/purplemux-improved/docs/keyboard-shortcuts/)** — including <kbd>⌘⇧U</kbd> for stats.
