---
title: Workspaces & groups
description: Organize related tabs into workspaces, then bundle workspaces into drag-and-drop groups in the sidebar.
eyebrow: Workspaces & Terminal
permalink: /docs/workspaces-groups/index.html
---
{% from "docs/callouts.njk" import callout %}

A workspace is a folder of related tabs — one project's terminal, diff panel, and Claude session sit together. Once you have several, groups in the sidebar keep them tidy.

## What a workspace contains

Each workspace has its own:

- **Default directory** — where new tabs' shells start.
- **Tabs and panes** — terminals, Claude sessions, diff panels, web-browser panels.
- **Layout** — split ratios, focus, the active tab in each pane.

All of it is persisted to `~/.purplemux/workspaces.json`, so a workspace is the unit purplemux-improved saves and restores. Closing the browser doesn't dissolve a workspace; tmux holds the shells open and the layout stays put.

## Create a workspace

The first run gives you one default workspace. To add another:

1. Click **+ New workspace** at the top of the sidebar, or press <kbd>⌘N</kbd>.
2. Name it and pick a default directory — typically the repo root for that project.
3. Hit Enter. The empty workspace opens.

{% call callout('tip', 'Pick the right starting directory') %}
The default directory is the cwd of every new shell in this workspace. If you point it at the project root, every fresh tab is one keystroke away from `pnpm dev`, `git status`, or starting a Claude session in the right place.
{% endcall %}

## Rename and delete

In the sidebar, right-click a workspace (or use the kebab menu) for **Rename** and **Delete**. Rename is also bound to <kbd>⌘⇧R</kbd> for the currently active workspace.

Deleting a workspace closes its tmux sessions and removes it from `workspaces.json`. There is no undo. Tabs that already crashed or were closed stay gone; live tabs get killed cleanly.

## Switch workspaces

Click any workspace in the sidebar, or use the number row:

| Action | macOS | Linux / Windows |
|---|---|---|
| Switch to workspace 1–9 | <kbd>⌘1</kbd> – <kbd>⌘9</kbd> | <kbd>Ctrl+1</kbd> – <kbd>Ctrl+9</kbd> |
| Toggle the sidebar | <kbd>⌘B</kbd> | <kbd>Ctrl+B</kbd> |
| Switch sidebar mode (Workspace ↔ Sessions) | <kbd>⌘⇧B</kbd> | <kbd>Ctrl+Shift+B</kbd> |

The order in the sidebar is the order the number keys map to. Drag a workspace up or down to change which slot it lives in.

## Group workspaces

Once you have a handful of workspaces, drop them into groups by drag-and-drop in the sidebar. A group is a collapsible header — useful for separating "client work", "side projects", and "ops" without forcing them into one flat list.

- **Create a group** — drag one workspace onto another and the sidebar offers to group them.
- **Rename** — right-click the group header.
- **Reorder** — drag groups up and down, drag workspaces in and out.
- **Collapse** — click the chevron on the group header.

Groups are visual organization. They don't change how tabs persist or how shortcuts behave; <kbd>⌘1</kbd> – <kbd>⌘9</kbd> still walks the flat order top-to-bottom.

## Where it lives on disk

Every change writes through to `~/.purplemux/workspaces.json`. You can inspect or back it up — see [Data directory](/purplemux-improved/docs/data-directory/) for the full file layout. If you wipe it while the server is running, purplemux-improved falls back to an empty workspace and starts over.

## What's next

- **[Tabs & panes](/purplemux-improved/docs/tabs-panes/)** — split, reorder, and focus inside a workspace.
- **[Save & restore layouts](/purplemux-improved/docs/save-restore/)** — how workspaces survive browser close and server reboot.
- **[Keyboard shortcuts](/purplemux-improved/docs/keyboard-shortcuts/)** — the full binding table.
