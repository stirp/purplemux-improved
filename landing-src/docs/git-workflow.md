---
title: Git workflow panel
description: A diff viewer, history browser, and sync controls that live next to your terminal — with a one-click handoff to Claude when something breaks.
eyebrow: Workspaces & Terminal
permalink: /docs/git-workflow/index.html
---
{% from "docs/callouts.njk" import callout %}

The Git panel is a tab type, just like a terminal. Open it next to a Claude session and you can read changes, walk history, and push without leaving the dashboard. When git itself misbehaves, "Ask Claude" hands the problem to a session in one click.

## Open the panel

Add a new tab and pick **Diff** as the panel type, or switch to it from the tab type menu on an existing tab. The panel binds to the same working directory as its sibling shells — if your tab is in `~/code/api`, the diff panel reads that repo.

| Action | macOS | Linux / Windows |
|---|---|---|
| Switch the active tab to Diff mode | <kbd>⌘⇧F</kbd> | <kbd>Ctrl+Shift+F</kbd> |

If the directory isn't a git repo, the panel says so and stays out of your way.

## The diff viewer

The Changes tab shows working-tree changes per file.

- **Side-by-side or inline** — toggle in the panel header. Side-by-side mirrors GitHub's split view; inline is GitHub's unified view.
- **Syntax highlighting** — full language detection for the languages your editor would highlight.
- **Inline hunk expansion** — click context lines around a hunk to expand the surrounding code without leaving the panel.
- **File list** — navigate between changed files in the sidebar of the panel.

Changes refresh every 10 seconds while the panel is visible, and immediately when you save in another tool.

## Commit history

Switch to the **History** tab for paginated commit log on the current branch. Each entry shows the hash, subject, author, and time; click to see the diff that landed in that commit. Useful when you want to remind yourself why a file looks the way it does without dropping back to the terminal for `git log`.

## Sync panel

The header strip shows the current branch, upstream, and an ahead/behind counter. Three actions:

- **Fetch** — `git fetch` against the upstream every 3 minutes in the background, plus on demand.
- **Pull** — fast-forward when possible.
- **Push** — push to the configured upstream.

Sync is intentionally narrow. It refuses anything that needs a decision — diverged branches, dirty worktrees, missing upstream — and tells you why.

{% call callout('warning', "When sync won't go") %}
Common failures the panel reports clearly:

- **No upstream** — `git push -u` hasn't been run yet.
- **Auth** — credentials missing or rejected.
- **Diverged** — local and remote both have unique commits; rebase or merge first.
- **Local changes** — uncommitted work blocks the pull.
- **Rejected** — push rejected for non-fast-forward.
{% endcall %}

## Ask Claude

When sync fails, the error toast offers an **Ask Claude** button. Clicking it pipes the failure context — the error kind, the relevant `git` output, and the current branch state — into the Claude tab in the same workspace as a prompt. Claude then walks the recovery: rebasing, resolving conflicts, configuring an upstream, whatever the error called for.

This is the panel's main bet: tooling for the common case, an LLM for the long tail. You don't switch contexts; the prompt arrives in the session you were already going to use.

## What's next

- **[Tabs & panes](/purplemux-improved/docs/tabs-panes/)** — splitting the diff panel next to a Claude session.
- **[First session](/purplemux-improved/docs/first-session/)** — how Claude permission prompts surface in the dashboard.
- **[Web browser panel](/purplemux-improved/docs/web-browser-panel/)** — the other panel type worth running side-by-side with a terminal.
