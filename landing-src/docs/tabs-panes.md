---
title: Tabs & panes
description: How tabs work inside a workspace, how to split panes, and the shortcuts that move focus between them.
eyebrow: Workspaces & Terminal
permalink: /docs/tabs-panes/index.html
---
{% from "docs/callouts.njk" import callout %}

A workspace is divided into **panes**, and each pane holds a stack of **tabs**. Splits give you parallel views; tabs let one pane host multiple shells without stealing screen space.

## Tabs

Every tab is a real shell attached to a tmux session. The tab title comes from the foreground process — type `vim` and the tab renames itself; quit and it goes back to the directory name.

| Action | macOS | Linux / Windows |
|---|---|---|
| New tab | <kbd>⌘T</kbd> | <kbd>Ctrl+T</kbd> |
| Close tab | <kbd>⌘W</kbd> | <kbd>Ctrl+W</kbd> |
| Previous tab | <kbd>⌘⇧[</kbd> | <kbd>Ctrl+Shift+[</kbd> |
| Next tab | <kbd>⌘⇧]</kbd> | <kbd>Ctrl+Shift+]</kbd> |
| Go to tab 1–9 | <kbd>⌃1</kbd> – <kbd>⌃9</kbd> | <kbd>Alt+1</kbd> – <kbd>Alt+9</kbd> |

Drag a tab in the tab bar to reorder it. The **+** button at the end of the tab bar opens the same template picker as <kbd>⌘T</kbd>.

{% call callout('tip', 'Templates beyond Terminal') %}
The new-tab menu lets you pick **Terminal**, **Claude**, **Diff**, or **Web browser** as the panel type. They're all tabs — you can mix them in the same pane and switch between them with the shortcuts above.
{% endcall %}

## Splitting panes

Tabs share screen space. To see two things at once, split the pane.

| Action | macOS | Linux / Windows |
|---|---|---|
| Split right | <kbd>⌘D</kbd> | <kbd>Ctrl+D</kbd> |
| Split down | <kbd>⌘⇧D</kbd> | <kbd>Ctrl+Shift+D</kbd> |

A new split inherits the workspace's default directory and starts with an empty terminal tab. Each pane has its own tab bar, so a pane on the right can host the diff viewer while the pane on the left runs `claude`.

## Move focus between panes

Use the directional shortcuts — they walk the split tree, so <kbd>⌘⌥→</kbd> from a deeply nested pane still lands on the visually adjacent one.

| Action | macOS | Linux / Windows |
|---|---|---|
| Focus left | <kbd>⌘⌥←</kbd> | <kbd>Ctrl+Alt+←</kbd> |
| Focus right | <kbd>⌘⌥→</kbd> | <kbd>Ctrl+Alt+→</kbd> |
| Focus up | <kbd>⌘⌥↑</kbd> | <kbd>Ctrl+Alt+↑</kbd> |
| Focus down | <kbd>⌘⌥↓</kbd> | <kbd>Ctrl+Alt+↓</kbd> |

## Resize and equalize

Drag the divider between panes for fine control, or use the keyboard.

| Action | macOS | Linux / Windows |
|---|---|---|
| Resize left | <kbd>⌘⌃⇧←</kbd> | <kbd>Ctrl+Alt+Shift+←</kbd> |
| Resize right | <kbd>⌘⌃⇧→</kbd> | <kbd>Ctrl+Alt+Shift+→</kbd> |
| Resize up | <kbd>⌘⌃⇧↑</kbd> | <kbd>Ctrl+Alt+Shift+↑</kbd> |
| Resize down | <kbd>⌘⌃⇧↓</kbd> | <kbd>Ctrl+Alt+Shift+↓</kbd> |
| Equalize splits | <kbd>⌘⌥=</kbd> | <kbd>Ctrl+Alt+=</kbd> |

Equalize is the fastest way to reset a layout that's drifted toward unusable extremes.

## Clear the screen

<kbd>⌘K</kbd> clears the current pane's terminal, the same way most native terminals do. The shell process keeps running; only the visible buffer is wiped.

| Action | macOS | Linux / Windows |
|---|---|---|
| Clear screen | <kbd>⌘K</kbd> | <kbd>Ctrl+K</kbd> |

## Tabs survive everything

Closing a tab kills its tmux session. Closing the *browser*, refreshing, or losing the network does not — every tab keeps running on the server. Reopen and the same panes, splits, and tabs come back.

For the recovery story across server reboots, see [Save & restore layouts](/purplemux-improved/docs/save-restore/).

## What's next

- **[Save & restore layouts](/purplemux-improved/docs/save-restore/)** — how this layout sticks around.
- **[Keyboard shortcuts](/purplemux-improved/docs/keyboard-shortcuts/)** — every binding in one table.
- **[Git workflow panel](/purplemux-improved/docs/git-workflow/)** — a useful tab type to drop into a split.
