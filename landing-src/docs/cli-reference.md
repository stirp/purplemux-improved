---
title: CLI reference
description: Every subcommand and flag of the purplemux-improved binaries.
eyebrow: Reference
permalink: /docs/cli-reference/index.html
---
{% from "docs/callouts.njk" import callout %}

Use `purplemux-improved` / `purplemux-improved start` to start the server and `pmuxi <subcommand>` to operate it through the HTTP API. `pmuxi` never starts a server, including when configuration is missing or a connection fails.

## Server and CLI commands

| Form | What it does |
|---|---|
| `purplemux-improved` | Start the server. Same as `purplemux-improved start`. |
| `pmuxi` | Show CLI help without connecting to or starting a server. |
| `pmuxi <subcommand>` | Talk to a running server's CLI HTTP API. |
| `pmuxi start` / `pmuxi server` | Fail without starting a server. |
| `purplemux-improved <subcommand>` | Compatible with existing CLI scripts; prefer `pmuxi` for new commands. |

Both commands are installed with the `purplemux-improved` package. From source, run `node bin/cli.js <subcommand>` for CLI operations. Help and feature discovery work offline; operations require an existing server.

## Starting the server

```bash
purplemux-improved              # default
purplemux-improved start        # same thing, explicit
PORT=9000 purplemux-improved    # custom port
HOST=all purplemux-improved     # bind everywhere
```

See [Ports & env vars](/purplemux-improved/docs/ports-env-vars/) for the full env surface.

The server prints its bound URLs, mode, and auth status:

```
  ⚡ purplemux-improved  v0.x.x
  ➜  Available on:
       http://127.0.0.1:8022
       http://192.168.1.42:8022
  ➜  Mode:   production
  ➜  Auth:   configured
```

If `8022` is already in use the server warns and binds to a random free port instead.

## Subcommands

Operations require a running server; `help`, `features`, and command `--help` work offline. Requests read the port from `~/.purplemux/port` and the auth token from `~/.purplemux/cli-token`, both written automatically at server startup.

| Command | Purpose |
|---|---|
| `pmuxi workspaces` | List workspaces |
| `pmuxi tab list [-w WS]` | List tabs (optionally scoped to a workspace) |
| `pmuxi tab create -w WS [-n NAME] [-t TYPE]` | Create a new tab |
| `pmuxi tab send -w WS TAB_ID CONTENT...` | Send input to a tab |
| `pmuxi tab status -w WS TAB_ID` | Inspect a tab's status |
| `pmuxi tab result -w WS TAB_ID` | Capture the tab pane's current content |
| `pmuxi tab close -w WS TAB_ID` | Close a tab |
| `pmuxi tab browser ...` | Drive a `web-browser` tab (Electron only) |
| `pmuxi api-guide` | Print the full HTTP API reference |
| `pmuxi help` | Show usage |

Output is JSON unless noted. `--workspace` and `-w` are interchangeable.

### `tab create` panel types

The `-t` / `--type` flag picks the panel type. Valid values:

| Value | Panel |
|---|---|
| `terminal` | Plain shell |
| `claude-code` | Shell with `claude` already running |
| `web-browser` | Embedded browser (Electron only) |
| `diff` | Git diff panel |

Without `-t`, you get a plain terminal.

### `tab browser` subcommands

These only work when the tab's panel type is `web-browser`, and only in the macOS Electron app — the bridge returns 503 otherwise.

| Subcommand | What it returns |
|---|---|
| `pmuxi tab browser url -w WS TAB_ID` | Current URL + page title |
| `pmuxi tab browser screenshot -w WS TAB_ID [-o FILE] [--full]` | PNG. With `-o` saves to disk; without, returns base64. `--full` captures the full page. |
| `pmuxi tab browser console -w WS TAB_ID [--since MS] [--level LEVEL]` | Recent console entries (ring buffer, 500 entries) |
| `pmuxi tab browser network -w WS TAB_ID [--since MS] [--method M] [--url SUBSTR] [--status CODE] [--request ID]` | Recent network entries; `--request ID` fetches one body |
| `pmuxi tab browser eval -w WS TAB_ID EXPR` | Evaluate a JS expression and serialize the result |

## Examples

```bash
# Find your workspace
pmuxi workspaces

# Create a Claude tab in workspace ws-MMKl07
pmuxi tab create -w ws-MMKl07 -t claude-code -n "refactor auth"

# Send a prompt to it (TAB_ID comes from `tab list`)
pmuxi tab send -w ws-MMKl07 tb-abc "Refactor src/lib/auth.ts to remove the cookie path"

# Watch its state
pmuxi tab status -w ws-MMKl07 tb-abc

# Snapshot the pane
pmuxi tab result -w ws-MMKl07 tb-abc

# Screenshot a web-browser tab full-page
pmuxi tab browser screenshot -w ws-MMKl07 tb-xyz -o page.png --full
```

## Authentication

Every subcommand sends `x-pmux-token: $(cat ~/.purplemux/cli-token)` and is verified server-side via `timingSafeEqual`. The `~/.purplemux/cli-token` file is generated on first server start with `randomBytes(32)` and stored mode `0600`.

If you need to drive the CLI from another shell or a script that can't see `~/.purplemux/`, set the env vars instead:

| Variable | Default | Effect |
|---|---|---|
| `PMUX_PORT` | contents of `~/.purplemux/port` | Port the CLI talks to |
| `PMUX_TOKEN` | contents of `~/.purplemux/cli-token` | Bearer token sent as `x-pmux-token` |

```bash
PMUX_PORT=8022 PMUX_TOKEN=$(cat ~/.purplemux/cli-token) pmuxi workspaces
```

{% call callout('warning') %}
The CLI token grants full server access. Treat it like a password. Don't paste it into chat, commit it, or expose it as a build env var. Rotate by deleting `~/.purplemux/cli-token` and restarting the server.
{% endcall %}

## update-notifier

`purplemux-improved` checks npm for a newer version on every launch (via `update-notifier`) and prints a banner if one exists. Disable with `NO_UPDATE_NOTIFIER=1` or any of the [standard `update-notifier` opt-outs](https://github.com/yeoman/update-notifier#user-settings).

## Full HTTP API

`pmuxi api-guide` prints the complete HTTP API reference for every `/api/cli/*` endpoint, including request bodies and response shapes — useful when you want to drive purplemux-improved directly from `curl` or another runtime.

## What's next

- **[Ports & env vars](/purplemux-improved/docs/ports-env-vars/)** — `PMUX_PORT` / `PMUX_TOKEN` in the broader env surface.
- **[Architecture](/purplemux-improved/docs/architecture/)** — what the CLI is actually talking to.
- **[Troubleshooting](/purplemux-improved/docs/troubleshooting/)** — when the CLI says "is the server running?".

## Fork feature commands

Run `pmuxi features` for the complete offline catalog, including required/optional fields and HTTP endpoints. `pmuxi worktree --help`, `pmuxi worktree create --help`, and `pmuxi help commit create` provide scoped help. From an unpublished source checkout, substitute `node bin/purplemux.js` for `purplemux` to use the current code.

| Group | Commands |
| --- | --- |
| `workspace` | `list`, `directories`, `create`, `update`, `reorder`, `delete` |
| `group` | `create`, `update`, `reorder`, `delete` (list via `workspace list`) |
| `worktree` | `source`, `list`, `create`, `generate-branch`, `adopt`, `remove` |
| `worktree` | `measure`, `preview-cleanup`, `cleanup` |
| `worktree` | `inspect-sync`, `fetch`, `merge`, `rebase`, `continue`, `abort` |
| `worktree` | `save-review`, `refresh-review`, `push`, `generate-draft`, `create-draft` |
| `commit` | `inspect`, `generate`, `create` |
| `session` | `claude`, `codex`, `entries`, `claude-status`, `codex-status`, `delete` |
| `queue` | `list`, `add`, `submit`, `answer`, `remove` |
| `upload` | `file` |
| `config` | `get`, `set` |
| `codex` | `launch-args` |
| `tab` | `rename` |

### Arguments and output

Use kebab-case flags (`--target-ref`) or camelCase JSON fields (`targetRef`). `-w`, `--workspace` and `--workspace-id` are aliases. Every flag takes a value, including booleans (`true`/`false`). Objects and arrays take JSON. `--data @request.json` reads a complete request object; `--data -` reads stdin. Explicit flags override JSON fields. Unknown fields/options fail before a request. Do not include `action`: the command determines it.

GET fields become query parameters. Other commands use JSON bodies except IDs embedded in paths and queue `workspaceId`/`tabId`, which always use query parameters. Uploads send binary bodies. Requests reuse the existing CLI token authentication and server validation.

Output is JSON. HTTP/argument errors and business failures (sync conflicts or partially failed cleanup) return a nonzero exit code. Business failures preserve the response JSON for inspection. Successful empty responses print `{"ok":true}`.

### Examples

```bash
pmuxi workspace directories --directory "/home/me/projects"
pmuxi workspace create --directory "/home/me/projects/app" --name "App"
pmuxi worktree source -w ws-EXAMPLE
pmuxi worktree generate-branch -w ws-EXAMPLE --title "Fix login"
pmuxi worktree create -w ws-EXAMPLE --name "Fix login" --branch "fix/login"
pmuxi worktree list -w ws-EXAMPLE > "worktrees.json"
pmuxi tab rename -w ws-EXAMPLE TAB_ID "Review"
pmuxi queue add -w ws-EXAMPLE --tab-id TAB_ID --id msg-1 --text "Run tests next"
pmuxi queue list -w ws-EXAMPLE --tab-id TAB_ID
pmuxi queue submit -w ws-EXAMPLE --tab-id TAB_ID
pmuxi upload file --file "./design.pdf" -w ws-EXAMPLE --tab-id TAB_ID
pmuxi session codex --cwd "/home/me/projects/app"
pmuxi session claude --tmux-session "TMUX_SESSION"
pmuxi config set --codex-environment '{"EXAMPLE_VARIABLE":"value"}'
pmuxi codex launch-args -w ws-EXAMPLE
```

Uploads accept nonempty files up to 50 MiB and return `{path,filename}`. Pass those objects in queue `attachments`. Queue messages require text or attachments. `queue answer` additionally requires `--agent-session-id`, obtained from `tab status`; stale session IDs are rejected.

### Reviewed worktree and commit snapshots

Worktree actions take `item: {repositoryId,directory,head,branch,confirmedIgnoredPaths?}`; cleanup takes `items: [item,...]`. Obtain `repositoryId` from `worktree list`'s `repositories[].id` and the remaining fields from the selected `worktrees[]`. Save the reviewed object as `{"item":{...}}` in `item.json`.

```bash
pmuxi worktree inspect-sync -w ws-EXAMPLE --data @item.json --target-ref refs/remotes/origin/main
pmuxi worktree generate-draft -w ws-EXAMPLE --data @item.json --remote origin --target-branch main --locale en
pmuxi worktree preview-cleanup -w ws-EXAMPLE --data @cleanup.json
pmuxi commit inspect --session TMUX_SESSION
pmuxi commit generate --session TMUX_SESSION --locale en > "commit-preview.json"
jq '{snapshot,message:{title,body}}' "commit-preview.json" > "commit.json"
# Review the generated message and files before executing:
pmuxi commit create --session TMUX_SESSION --data @commit.json
```

`merge` and `rebase` require `targetRef` and `targetHead` from `inspect-sync`. The `item` is the worktree modified by the operation; `targetRef` is merged into it. Fetch first if fresh remote refs are needed. Re-read snapshots after HEAD changes, including conflicts, before `continue`/`abort`. `inspect-sync` reports `main` as a blocker; among synchronization operations, only `merge` may execute on the main worktree. Rebase, continue and abort remain blocked there, so resolve main-worktree merge conflicts in Git. `remove` takes flat snapshot fields rather than `item`, and preserves the branch unless `deleteBranch` is explicitly true. Cleanup retains ignored-file and active-session protection.

`push` and `create-draft` also support the main worktree, regardless of its checked-out branch name. They ignore the `main` blocker while retaining snapshot, dirty-file, in-progress operation, and remote validation. Removal and cleanup still protect the main worktree.

`generate-draft` only generates title/body. `push` and `create-draft` perform remote writes using the server's Git/hosting CLI authentication. To publish the reviewed draft, add `title`/`body` to the item request and use `create-draft --remote origin --target-branch main --provider github` (or `gitlab`). The [Chinese CLI reference](/purplemux-improved/zh-CN/docs/cli-reference/#fork-新增能力) includes complete `jq` workflows for preparing these files.

`--session` for commits is a tmux `sessionName` from `tab list`, not a tab ID or agent session ID. `workspace delete` deletes original records by default; `--delete-sessions false` retains them. `session delete` hides/removes history by default; `--delete-original true` also deletes original records. Removing a workspace does not remove its disk worktree or branch.

`config set` supports `codexEnvironment`, `branchNameProvider`, `branchNamePrompt`, `commitMessagePrompt`, `reviewDescriptionPrompt`, `editorUrl`, and `editorPreset`. The environment map replaces existing settings and affects newly launched processes. `config get` and `codex launch-args` include configured environment values.

Browser-only features such as automatic child-workspace hiding, touch dragging, message expansion, local storage cleanup, slash-menu presentation and terminal flow control remain UI/runtime behavior. `session entries` exposes underlying tool and plan events without reproducing the UI.
