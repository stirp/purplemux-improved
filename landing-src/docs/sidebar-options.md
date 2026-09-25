---
title: Sidebar & Claude options
description: Reorder and hide sidebar shortcuts, manage the quick-prompts library, and toggle Claude CLI flags.
eyebrow: Customization
permalink: /docs/sidebar-options/index.html
---
{% from "docs/callouts.njk" import callout %}

The sidebar and the input bar are made of small lists you can reshape — shortcut links at the bottom of the sidebar, prompt buttons above the input. The Claude tab in Settings holds CLI-level toggles for sessions you launch from the dashboard.

## Sidebar items

Settings (<kbd>⌘,</kbd>) → **Sidebar** tab. The list controls the shortcut row that lives at the bottom of the sidebar — links to dashboards, internal tools, anything URL-addressable.

Each row has a grip handle, name, URL, and a switch. You can:

- **Drag** the grip to reorder. Both built-in and custom items move freely.
- **Toggle** the switch to hide an item without deleting it.
- **Edit** custom items (pencil icon) — change name, icon, or URL.
- **Delete** custom items (trash icon).
- **Reset to Default** — restores the built-in items, deletes all custom ones, clears the order.

### Adding a custom item

Click **Add Item** at the bottom. You'll get a small form:

- **Name** — appears as the tooltip and label.
- **Icon** — picked from a searchable lucide-react gallery.
- **URL** — anything `http(s)://...` works. Internal Grafana, Vercel dashboards, an internal admin tool.

Click Save and the row appears at the bottom of the list. Drag it where you want it.

{% call callout('note', 'Built-ins can be hidden, not deleted') %}
Built-in items (the ones purplemux-improved ships with) only have a switch and a grip — no edit or delete. They're always there in case you change your mind. Custom items get the full kit.
{% endcall %}

## Quick prompts

Settings → **Quick Prompts** tab. These are the buttons that sit above the Claude input field — single-click to send a pre-canned message.

Same pattern as sidebar items:

- Drag to reorder.
- Toggle to hide.
- Edit / delete custom prompts.
- Reset to Default.

Adding a prompt asks for a **name** (the button label) and the **prompt** itself (multi-line text). Use them for things you type often: "Run the test suite", "Summarize the last commit", "Review the current diff".

## Claude CLI options

Settings → **Claude** tab. These flags affect *how purplemux-improved launches the Claude CLI* in new tabs — they don't change behavior of an already-running session.

### Skip Permission Checks

Adds `--dangerously-skip-permissions` to the `claude` command. Claude will run tools and edit files without asking for approval each time.

This is the same flag the official CLI exposes — purplemux-improved doesn't loosen any safety on top of it. Read [Anthropic's documentation](https://docs.anthropic.com/en/docs/claude-code/cli-reference) before turning it on. Treat it as opt-in for trusted workspaces only.

### Show Terminal with Claude

When **on** (default): a Claude tab shows the live session view *and* the underlying terminal pane side-by-side, so you can drop into the shell whenever you want.

When **off**: new Claude tabs open with the terminal collapsed. The session view fills the whole pane. You can still expand the terminal manually per tab; this only changes the default for newly created tabs.

Use the off setting if you mostly drive Claude through the timeline view and want a cleaner default.

## What's next

- **[Themes & fonts](/purplemux-improved/docs/themes-fonts/)** — light, dark, system; font-size presets.
- **[Editor integration](/purplemux-improved/docs/editor-integration/)** — wire up VS Code, Cursor, code-server.
- **[First session](/purplemux-improved/docs/first-session/)** — refresh on the dashboard layout.
