# Claude CLI Work-State Detection

System that detects the in-progress state of the Claude CLI on the server, broadcasts it to the client over WebSocket, and reflects it in the UI indicators.

**Core principle**: `cliState` has a **single source of truth — hook events** (real Claude Code hooks + one hook-equivalent synthesized on the server from the JSONL interrupt marker). All transitions go through `deriveStateFromEvent`, and seq is monotonic per tab. The previous multi-source heuristics (JSONL-driven promotion, pane capture, client-side local derivation) have otherwise been removed; JSONL is only consulted for the synthetic `interrupt` event and for metadata (snippet, currentAction).

---

## State Definitions

### Worktree safety checks

Worktree synchronization passes the strict tmux pane snapshot to `StatusManager.poll(snapshot)` and `areSessionsIdle(sessions, snapshot)`. This avoids a second non-strict query masking tmux errors during refresh. Missing panes remain unsafe.

Application updates reuse this strict snapshot and idle policy before downloading and again before restarting. Extra panes, untracked sessions, permission/compaction waits, and failed queries block the operation; a blocked download is retained for an explicit retry, with no delayed restart scheduled. Restart detaches PTYs without killing tmux sessions. See [the update specification](../.specs/v22/changes/auto-upgrade-detection/spec.md).
The explicitly confirmed force-upgrade action bypasses both update idle checks for that attempt only; ordinary retries still enforce them. It does not relax worktree or reclamation safety checks. See [skip-version and force-upgrade behavior](../.specs/v22/changes/upgrade-popup-optimization/spec.md).
Terminal panels and inactive agent panels require both an idle terminal status and a foreground command in `SAFE_SHELLS`. A provider-backed panel's synthetic idle terminal status alone does not make a build or editor safe. The supplied snapshot takes precedence over cached process metadata; ordinary polling without a snapshot keeps its existing query behavior.

This foreground-shell requirement also applies to Terminal views with a persistent Agent binding, including legacy tabs without an explicit panel type. Such bindings must additionally satisfy the Agent work-state checks. A suspended idle Agent cannot authorize worktree operations while `make`, `vim`, or another non-shell command owns the foreground.

Initial scanning and polling still run terminal status and listening-port detection for these bound Terminal views. A background server keeps `terminalStatus=server` and its port list even after the Agent exits to a foreground shell, so worktree and application-update guards remain blocked until the server stops.

Idle tab reclamation requires an idle / ready-for-review / cancelled status and a fresh native snapshot explicitly reporting idle. Compaction, permission requests, queued input (including delivery awaiting completion), unknown state and extra child processes prevent reclamation. The last activity time includes transcript writes/events, terminal input and process start time. The reclaimer retains the original session identity and directory in the workflow index before closing a tab; it does not change manual work status, titles, tags, or historical records. Sessions navigation prefers the retained directory over older turn metadata.

Reclamation recognizes the application's Codex launcher path, exact Claude bootstrap/inline launcher, and npm bin links resolved to known agent packages. These wrappers must lead to an actual agent of the bound provider in a single chain; arbitrary Node scripts, tools and native subagents remain protected. Shutdown signals only the terminal agent and waits for every agent and launcher to exit before destroying tmux. A surviving launcher keeps the terminal and tab intact.

Node/npm Claude is an actual agent, so any child blocks reclamation. Only the known Codex npm forwarding script may lead directly to a native Codex process. Historical single-line Claude launchers are compared as parsed syntax against approved script/build forms without executing their code; formatting differences are ignored, while changed statements and literals remain blocked.

### Tab identity and display view

The persistent `ITab.agentState` owns the provider, root session ID, JSONL path and summary. `panelType` selects a view; `currentProcess` records tmux's foreground command; neither replaces the binding. `getTabAgentProviderId` / `getTabAgentProvider` resolve identity consistently across polling, hooks, transcript watchers, CLI queries, workflow aggregation, auto-resume and idle reclamation. New Agent tabs are bound before their first native session exists. Layout reads migrate legacy Agent panels and Claude fields in memory; ordinary layout writes persist that normalized representation.

Chat/Terminal transitions retain the binding. Explicit provider changes initialize the selected provider through the same client/server transition. Process exit marks runtime state inactive but retains the recoverable session. A same-provider process check cannot overwrite a known root session with a review child. Unknown terminal/node processes gain no identity from their executable name alone. Codex review watching continues in Terminal view; provider hook validation uses the binding as well. See [Tab identity specification](../.specs/v22/changes/tab-agent-identity/spec.md).

`/api/check-agent` validates only the bound provider when a Tab already has an Agent identity. If that provider has exited, it reports `running=false` even when another Agent exists under the pane; detection does not replace the binding. Provider-wide discovery remains available for unbound tabs, and an explicit provider switch selects the new binding before checking it.

### Agent Process State (`agentProcess: boolean | null`)

Determines whether the agent CLI process (Claude, Codex, …) is running inside a tmux pane. Managed independently from `cliState` and detected from two paths (terminal WS and timeline WS).

| Value | Meaning |
| --- | --- |
| `null` | Not yet detected (initial value) |
| `true` | Agent process is running |
| `false` | No agent process |

A separate `agentInstalled: boolean` field (default `true`) gates the entire UI; if `false`, a "Claude not installed" screen is shown.

Two detection paths:

| Path | Trigger | Server check | Sets value |
| --- | --- | --- | --- |
| Terminal WS `onTitleChange` | tmux title change | `/api/check-claude` → `isClaudeRunning()` | `true` / `false` |
| Timeline WS | Session file change | `detectActiveSession()` | `true` / `false` |

Both paths write to the same `agentProcess` field; the `agentProcessCheckedAt` server timestamp prevents stale updates.

Server startup initializes the status manager before auto-resume, and only resumes agents after HTTP is listening and the actual port, hooks, CLI token and workspace prompts are ready. Codex launchers request their arguments from that listener. Missing port files, connection failures and HTTP 502/503/504 are retried every 500 ms within a 60-second deadline. Each request, including its response body, can use the remaining budget so development API compilation is not repeatedly aborted after five seconds. A timeout identifies the launch-args endpoint and directs the user to the server/compilation logs. Authentication and invalid-response errors fail immediately. This retry only covers argument retrieval; it does not restart an exited Codex process or submit saved drafts.

Codex desktop and mobile Chat share `useCodexBootCheck`. A running process or active work state opens the timeline even before a session ID exists. The boot component no longer reports failure simply because ten seconds elapsed: it waits at least sixty seconds, then requires a new successful `/api/check-agent` request explicitly reporting `running=false`. Network/HTTP errors, invalid responses and request timeouts leave startup unconfirmed. Checks run serially with an 800 ms delay and a ten-second deadline including body reading; cleanup aborts the request and drops late results, and the store's process timestamp rejects stale evidence. Detection continues after an error so a later running Codex automatically opens Chat without restarting or submitting a message. Trust and update prompts retain their display priority. See [Codex launch lifecycle](../.specs/v22/changes/codex-launch-lifecycle/spec.md).

Desktop and mobile view-mode menus also call `/api/check-agent` before opening, through `refreshDetectedAgent` and `applyAgentCheckResult`. The live provider identity selects the existing Chat view even when tmux reports the Node launcher as `node`. A confirmed exit clears running evidence in Terminal mode while retaining the session binding; failed requests preserve the last known state. An exit check older than the latest Agent activity event cannot unlock a provider switch. Menus and keyboard shortcuts use the same freshness rule, and invalid responses do not count as exit evidence. Detection waits at most three seconds, including response-body reading: the deadline aborts the request and lets the menu open with its last known state. Late responses cannot change that state, and completed checks clear the deadline timer. Choosing Chat only changes the panel view and does not launch another CLI.

Claude process candidates are traversed breadth-first from the pane PID through `getChildPids`, with PID deduplication and limits of 16 levels, 1024 candidates, and 16 concurrent child queries. Both running detection and session binding use this traversal, including preloaded direct children. This covers nested shells, the Node environment launcher, and non-exec shell functions beyond children and grandchildren while bounding polling cost. Descendants beyond these limits are not scanned. PID files outside this descendant tree are not bound to the pane.

The server-side `detectActiveSession` still uses its own `TSessionDetectionStatus` type internally; the client-facing mapping is: `running`/`starting` → `true`, `not-running` → `false`, `not-installed` → `agentInstalled = false`.

### CLI Work State (`TCliState`)

Codex startup trust fallback only switches Chat to the terminal when no Agent session ID is bound and `cliState` is `inactive` or `unknown`. Once a session is bound or the CLI enters a working state, menu text alone cannot switch panels; this prevents quoted trust menus in normal chat from taking focus. Native prompts encountered inside an established session remain accessible through the existing terminal controls. This UI guard does not change the server's work-state derivation.

State of the work in progress inside the Claude CLI. Only changed by deterministic derivation from hook events.

| State | Meaning | Trigger |
| --- | --- | --- |
| `busy` | Processing a user request | `prompt-submit` hook |
| `idle` | Response complete + acknowledged by user | `session-start` hook, synthetic `interrupt` event, or `dismissTab` |
| `ready-for-review` | Response complete, awaiting user ack | `stop` hook |
| `needs-input` | Permission prompt / awaiting user input | `notification` hook |
| `unknown` | Was `busy` before a server restart, recovery not finished | Awaiting `resolveUnknown` |
| `inactive` | Initial state when the Claude process is not running | Default on tab creation |
| `cancelled` | User is deleting the tab | Client-only local state |

### Transition Rules (`deriveStateFromEvent`)

Pure function. `src/lib/status-manager.ts`:

```ts
export const deriveStateFromEvent = (event: ILastEvent | null, fallback: TCliState): TCliState => {
  if (!event) return fallback;
  switch (event.name) {
    case 'session-start': return 'idle';
    case 'prompt-submit': return 'busy';
    case 'notification':  return 'needs-input';
    case 'stop':          return 'ready-for-review';
    case 'interrupt':     return 'idle';
  }
};
```

`'interrupt'` is the only event name that does not correspond to a real Claude Code hook. Claude CLI does not fire any hook when the user presses Esc mid-stream, so the JSONL watcher synthesizes one on the server when it sees a `[Request interrupted by user]` entry (see "Synthetic Interrupt Event").

**Exception**: if `prevState === 'cancelled'`, the state stays `cancelled` even when a hook arrives.

**`inactive` handling**: it is just a default value, not a non-overwritable state. Even when a new tab starts in `inactive`, the first `session-start` hook promotes it to `idle`. (Previously both `inactive` and `cancelled` blocked transitions, which caused a bug where "start new conversation" would be stuck on `Creating new conversation...`. The `inactive` block was removed for that reason.)

### Releasing `ready-for-review`

The `ready-for-review → idle` transition only happens through the **`dismissTab` action**:

- The user focuses the tab (auto-dismiss)
- An explicit dismiss from the notification sheet

Hooks and the JSONL watcher do not cause this transition.

### Releasing `needs-input` (User Selection Ack)

When the user selects an option on a permission prompt, Claude resumes work but does not fire a `prompt-submit` hook. Therefore the `needs-input → busy` transition cannot be detected from hooks alone, so the client sends an explicit ack.

**Flow**:

1. `PermissionPromptItem.handleSelect` — after `sendSelection` succeeds, sends a `status:ack-notification` WS message with the current `lastEvent.seq`
2. `StatusManager.ackNotificationInput(tabId, seq)`:
   - If `cliState !== 'needs-input'`, ignore
   - If `lastEvent.name !== 'notification'` or `lastEvent.seq !== seq`, ignore (a newer hook has already arrived)
   - Otherwise: `applyCliState(busy)` + `persistToLayout` + `broadcastUpdate`

**Meaning of the seq guard**: if another hook (consecutive `notification` or `stop`) arrives before the ack does, `entry.lastEvent.seq` increments and no longer matches the ack → ignored. Since the server has already moved to a newer state, the late ack cannot overwrite it (race protection).

`eventSeq` is not incremented — this is a client action, not a hook event. The next real hook will arrive with a value larger than the current seq and be processed normally.

### Tab Display State (`TTabDisplayStatus`)

The desktop workspace sidebar uses a compact summary without changing workflow aggregation. Waiting-for-input agents take visual priority, followed by unknown/disconnected agent status, running agents, and the workspace workflow stage. Pending stages are hidden and completed stages use a check icon. Review keeps its workflow label; it does not imply an outstanding permission request. Tooltips preserve the workflow stage when runtime status occupies the badge. The workspace row references the compact badge through `aria-describedby`, exposing that same full status when the row receives keyboard focus. Disconnected agents show unknown rather than stale running indicators. Mobile navigation keeps the existing per-tab indicators.

`selectTabDisplayStatus(tabs, tabId)` maps `cliState` to a UI display value:

| cliState | Display state | UI indicator |
| --- | --- | --- |
| `busy` | `busy` | Spinner |
| `ready-for-review` | `ready-for-review` | Purple dot (pulse) |
| `needs-input` | `needs-input` | Amber dot (pulse) |
| `unknown` | `unknown` | Gray dot (static) |
| `idle` | `idle` | None |
| `inactive` | `idle` | None |
| `cancelled` | (component-specific) | — |

### Session View (`TSessionView`)

Stored directly in the tab state (not derived). Decides which screen the Claude panel shows.

| State | Meaning | Enter condition | Exit condition |
| --- | --- | --- | --- |
| `session-list` | Browsing past sessions | Default. Also entered when `agentProcess` transitions `true → false` while in `timeline` | User clicks new/resume → `check` |
| `check` | Terminal preparation + agent start | User action (new conversation, resume, mode switch) | `agentProcess` becomes `true` → auto-transition to `timeline` |
| `timeline` | Active conversation | Auto from `check` when `agentProcess = true`. Also set directly on initial load if `agentProcess = true` | `agentProcess` transitions `true → false` → auto-transition to `session-list` |

The auto-transitions are handled inside `setAgentProcess`: when `agentProcess` becomes `true` and `sessionView` is `'check'` or `'session-list'`, it flips to `'timeline'`; when `agentProcess` transitions **`true → false`** (agent was confirmed running and then exited) and `sessionView === 'timeline'`, it flips to `'session-list'`. A `null → false` transition does **not** flip, so a freshly opened resume tab stays on `'check'` during initial shell detection until the actual agent process comes up. Additionally, `useTimeline` no longer infers `agentProcess = true` from `timeline:init` alone (JSONL existence ≠ process running) — the store's `agentProcess` is driven by `timeline:session-changed` (`reason='session-waiting'`, only sent when the server confirms a running agent) and by the terminal `onTitleChange` → `/api/check-claude` path.

For newly created tabs, `useLayoutStore.createTabInPane` owns the launch-state decision. It enters `check` for command/resume requests only when no cwd was requested or the returned cwd matches the request. If the server falls back from a missing directory, it skips command/resume and the tab keeps the default `session-list` view. Desktop `PaneContainer` and mobile `MobileTerminalPage` only merge tab metadata after creation; they must preserve this decision rather than set `check` again.

External process imports prepare a plain terminal without an agent binding until the source process exits. After delivering the verified session's resume command, `agent-process-manager.ts` binds the target, changes its panel type, registers it with StatusManager and calls `markAgentLaunch`. The API reports command delivery, not an idle/ready agent; existing hooks and process checks establish the actual state. An uncertain dispatch is persisted and cannot be resent blindly. External process rows do not write `TCliState` or manual workflow status.

Gates (checked before the view switch):

- Startup directory trust prompts override the normal panel view on desktop and mobile. Detection reads the parsed visible terminal buffer for Claude/Codex tabs regardless of `cliState`, since a running process or session hook does not imply startup confirmation has finished. It rescans on enable, tab/session changes, and parsed output; xterm soft wraps are joined, and options reuse the permission parser within the latest prompt block. Claude navigation and Enter are separate writes 80ms apart, with scope, path and cursor revalidated before Enter. Scope changes, disabling or unmounting cancel pending submission. Failed validation retains a retryable card; unknown unnumbered cursors disable answers and preserve the terminal escape path. Numbered Claude and Codex prompts retain numeric selection.
- `agentInstalled === false` → not-installed screen
- `agentProcess === null && view !== 'check'` → loading spinner

---

## Tab Store (`useTabStore`)

A Zustand store that manages all tab state as `Record<tabId, ITabState>`.

### Key Fields

| Field | Type | Source | Purpose |
| --- | --- | --- | --- |
| `terminalConnected` | `boolean` | Terminal WS | Whether input is allowed |
| `agentProcess` | `boolean \| null` | Terminal/Timeline WS | Process presence (`null` = not yet detected) |
| `agentProcessCheckedAt` | `number` | Server timestamp | Prevent stale updates |
| `agentInstalled` | `boolean` | Timeline WS | Gate for "not installed" screen |
| `sessionView` | `TSessionView` | User action / auto-transition | Which screen to show |
| `cliState` | `TCliState` | Server WS (`status:update` / hook derivation) | Work state, tab indicator |
| `lastEvent` | `ILastEvent \| null` | Server WS (`status:hook-event`) | Track event order, trigger PermissionPrompt re-fetch |
| `eventSeq` | `number` | Server WS | Monotonic counter to prevent reordering |
| `isTimelineLoading` | `boolean` | Timeline WS init received | Whether timeline data is still loading |
| `compactingSince` | `number \| null` | `pre-compact`/`post-compact` hooks | Drives the timeline compacting indicator |

### Write Paths

| Path | Action | Notes |
| --- | --- | --- |
| Server sync (`status:sync`) | `syncAllFromServer` | Initial load, `cancelled` protected |
| Server update (`status:update`) | `updateFromServer` | Metadata + cliState, `cancelled` protected, **stale seq preserves cliState/busySince/readyForReviewAt/dismissedAt** |
| Server event (`status:hook-event`) | `applyHookEvent` | Updates only `lastEvent`/`eventSeq`, prevents seq reordering |
| User dismiss | `dismissTab` | Local immediate `ready-for-review → idle` + WS `status:tab-dismissed` |
| User tab delete | `cancelTab` | `cliState = 'cancelled'`, local only |

**The client never propagates `cliState` back to the server.** The legacy `notifyCliState` / `status:cli-state` paths have been removed.

### Stale Seq Guard in `updateFromServer`

When `status:update` arrives with `update.eventSeq < existing.eventSeq`, the broadcast is a metadata-only message that was queued behind a newer seq-bearing event. In that case `updateFromServer` preserves `cliState`, `busySince`, `readyForReviewAt`, and `dismissedAt` from the existing state and merges only the non-state metadata fields. This prevents a late `busy` metadata broadcast from clobbering an `idle` state that a higher-seq `interrupt` (or any future event) already set.

### `isCliIdle()` Helper

Both `idle` and `ready-for-review` mean "waiting for work", so:

```ts
export const isCliIdle = (cliState: TCliState): boolean =>
  cliState === 'idle' || cliState === 'ready-for-review';
```

Used in: `WebInputBar` input mode, restart-complete detection, dismiss-on-focus.

---

## Claude Code Hook System

Uses Claude Code's [Hook](https://docs.anthropic.com/en/docs/claude-code/hooks) feature to receive Claude's work state immediately.

### Hook Settings

`ensureHookSettings()` runs at server startup and creates `~/.purplemux/hooks.json`.

| File | Purpose |
| --- | --- |
| `~/.purplemux/hooks.json` | Hook event → shell script mapping |
| `~/.purplemux/status-hook.sh` | Script that POSTs to the server |
| `~/.purplemux/port` | Current server port (referenced by the script) |

### Hook Event Mapping

| Claude Code Hook | Sent event | Result |
| --- | --- | --- |
| `SessionStart` | `session-start` | → `idle` |
| `UserPromptSubmit` | `prompt-submit` | → `busy` |
| `Notification` | `notification` | → `needs-input` (filtered by notificationType) |
| `Stop` | `stop` | → `ready-for-review` |
| `StopFailure` | `stop` | → `ready-for-review` |
| `PreCompact` | `pre-compact` | → `compactingSince = now` (cliState unchanged) |
| `PostCompact` | `post-compact` | → `compactingSince = null` (cliState unchanged) |
| _(synthesized by JSONL watcher)_ | `interrupt` | → `idle` (see below) |

`pre-compact`/`post-compact` do not touch `cliState`/`eventSeq`/`lastEvent`; they only set the separate `compactingSince` field. That value drives the timeline-view's compacting indicator (60s window). To handle a missing `post-compact`, the server auto-clears it via a `COMPACT_STALE_MS = 60s` timer.

### Notification Filtering (`INPUT_REQUESTING_NOTIFICATION_TYPES`)

Claude's `Notification` hook fires at many moments, but only cases that need user input should transition to `needs-input`. The whitelist in `status-manager.ts`:

```ts
const INPUT_REQUESTING_NOTIFICATION_TYPES = new Set(['permission_prompt', 'worker_permission_prompt']);
```

The hook script parses `notification_type` from the stdin JSON and includes it in the payload, so the server ignores types that are not in the whitelist (e.g. idle notifications) without transitioning state.

### Hook Script

`~/.purplemux/status-hook.sh` is generated from `HOOK_SCRIPT_CONTENT` in `hook-settings.ts`. Core behavior:

- Looks up the session name with `tmux display-message` (so the server knows which tab)
- If `event === 'notification'`, parses `notification_type` from stdin JSON and includes it in the payload
- POSTs `{ event, session, notificationType? }` to `/api/status/hook` via `curl`

### Synthetic Interrupt Event

Claude CLI aborts a streaming turn locally when the user presses Esc and writes `[Request interrupted by user]` into the transcript JSONL without firing any hook (`query.ts:createUserInterruptionMessage`). To recover `busy → idle` without leaving the tab stuck, `onJsonlFileChange` synthesizes a hook-equivalent `interrupt` event:

1. `scanLines` sets `interrupted: true` when the last non-sidechain user entry's first content block starts with `[Request interrupted by user` (see `INTERRUPT_PREFIX`). This naturally handles the "user typed a new prompt right after Esc" case — the new user entry becomes the last match and suppresses the synthesis.
2. `onJsonlFileChange` fires `updateTabFromHook(tmuxSession, 'interrupt')` when **all** of the following hold:
   - `entry.cliState === 'busy'`
   - `scan.lastEntryTs > entry.lastInterruptTs` (dedup: new interrupt line, not a previously processed one)
   - `scan.lastEntryTs > entry.lastEvent.at` (race guard: no real hook arrived after the interrupt was written)
3. `updateTabFromHook` goes through the usual path — bump `eventSeq`, broadcast `status:hook-event`, apply `deriveStateFromEvent → 'idle'`, `persistToLayout`, `status:update`. Push notifications are skipped because only `ready-for-review`/`needs-input` trigger push.

The `lastEvent.at` comparison protects against a narrow race: `prompt-submit` hook POST arriving at the server before the JSONL FS event fires for the interrupt line. Without the guard, the synthetic interrupt could fire after `prompt-submit` was already processed and drag the state back to `idle`.

After transitioning to `idle`, `applyCliState` stops the JSONL watcher (idle is not a watched state). It will be restarted by the next `prompt-submit` hook.

### Agent Tab Hooks (Reference)

Normal tabs go through the shell script above, but **agent tabs / brain sessions** use `type: 'http'` hooks generated by `buildAgentTabHookSettings` / `buildAgentBrainHookSettings`, which POST directly to `/api/agent-rpc/{agentId}/...` (only `Stop` / `StopFailure`). They are separate from the StatusManager path and are out of scope here.

### Hook API Endpoint

`/api/status/hook` — requires `x-pmux-token` header (same CLI token as `/api/cli/*`). Pure forward: emits the raw payload onto the per-provider EventEmitter (`globalThis.__ptClaudeHookEvents` for Claude, `globalThis.__ptCodexHookEvents` for Codex). The provider observer (attached per tab via `IAgentProvider.attachWorkStateObserver`) is the sole listener — it translates the payload, applies any provider-specific meta side effects, and forwards a `TAgentWorkStateEvent` to `StatusManager.handleObserverEvent`, which dispatches into `updateTabFromHook`. If `event` is `poll` or `session` is missing on the Claude path, the endpoint triggers a full poll directly.

### Processing Flow (`updateTabFromHook`)

```
hook received
  │
  ├─ look up tabId/entry (return if missing)
  ├─ check event whitelist (session-start/prompt-submit/notification/stop)
  │
  ├─ entry.eventSeq += 1
  ├─ entry.lastEvent = { name, at: Date.now(), seq }
  ├─ broadcast status:hook-event (seq + name + at)
  │
  ├─ newState = deriveStateFromEvent(entry.lastEvent, prevState)
  │   (if prevState === 'cancelled', stays the same)
  │
  └─ if prevState !== newState:
      ├─ applyCliState(tabId, entry, newState)
      ├─ persistToLayout(entry)
      └─ broadcast status:update
```

After a `stop` event, `refreshSnippet` asynchronously reads the final JSONL state and broadcasts `currentAction` / `lastAssistantSnippet` (with a 500ms delay).

### Event Shadowing (`status:hook-event`)

`status:hook-event` is **always** broadcast even if `cliState` doesn't change (e.g. consecutive `notification` while already in `needs-input`). The client only applies it in `applyHookEvent` when `event.seq > prev.eventSeq`, preventing reordering.

`PermissionPromptItem` subscribes to `lastEvent.seq` as a `useEffect` dep so that consecutive permission prompts auto-refetch new options:

```
Consecutive permission prompts:
prompt-submit → lastEvent{name:'prompt-submit', seq:1} → busy
notification  → lastEvent{name:'notification', seq:2}  → needs-input
user selection
notification  → lastEvent{name:'notification', seq:3}  → needs-input (same cliState, seq++)
stop          → lastEvent{name:'stop', seq:4}          → ready-for-review
```

---

## Server Restart Policy

The only state that can be lost across a server restart is `busy` (Claude might fire `stop`/`notification` while the server is down). All other states have "the ball in the user's court", so no automatic transitions occur and the persisted value can stay as-is.

`StatusManager.scanAll` reads the persisted `cliState` from the layout:

| Persisted cliState | After restart | Follow-up |
| --- | --- | --- |
| `busy` | **`unknown`** | `resolveUnknown` scheduled immediately |
| `needs-input` | unchanged | JSONL watcher started |
| Others | unchanged | — |

### `resolveUnknown` — Background Recovery for Unknown Tabs

For tabs converted to `unknown` from `busy`, only definitive signals are used to promote:

1. **Claude process check** — `isClaudeRunning(panePid)` fails → confirm `idle` (silent, no push)
2. **JSONL tail check** — `checkJsonlIdle` returns `idle && !stale && lastAssistantSnippet` → confirm `ready-for-review` (silent)
3. **Otherwise** → keep `unknown`, wait for the next hook

**Pane capture is not used.** A previous permission prompt left in the scrollback could be misread as the current one.

JSONL watcher is also started in the `unknown` state — it does not change `cliState`, but `currentAction` / `lastAssistantMessage` metadata keep updating.

### Busy Stuck Safety Net

If a `busy` state lasts longer than `BUSY_STUCK_MS` (**10 minutes**) and the agent process has died, silently recover to `idle`. Performed inside the metadata poll loop. Designed to handle dropped `stop` hooks (e.g. SIGKILL).

### Agent-Gone Inactive Guard (F1/F2)

For agent tabs in any active state (`busy` / `idle` / `needs-input` / `ready-for-review`), the metadata poll silently transitions to `inactive` only when **all** of the following hold:

1. The agent process is not running for the pane (`provider.isAgentRunning(panePid)` returns `false`).
2. **F1 — recent-launch grace fails**: `lastResumeOrStartedAt` is undefined or older than 5 seconds. The stamp is refreshed by auto-resume `sendKeysSeparated`, the synthetic and real `session-start` hooks, and any other path that calls `StatusManager.markAgentLaunch`. This blocks the brief boot window where the Rust binary (e.g. Codex) has spawned but the process tree has not yet caught up.
3. **F2 — pane title is shell-style**: the title looks like `<cmd>|<path>` (i.e. tmux's `set-titles-string` default) or is empty. Agent CLIs override this to their own format, so a non-shell title is treated as "agent still owns the pane" and skips the transition. This blocks the false negative when an agent forks a transient child mid-poll.

Together these guards keep the `cliState` stable through the boot/fork windows that previously caused indicator ping-pong, while still recognizing a clean exit (`/quit`, `/exit`) within one poll cycle.

---

## JSONL Watcher (Metadata Only)

For tabs in `busy` / `needs-input` / `unknown` / `ready-for-review`, an `fs.watch` is set on the JSONL file and `checkJsonlIdle` is called on file changes.

| Trigger | Action |
| --- | --- |
| Start | Entering `busy`/`needs-input`/`unknown` (hook path or scanAll) |
| Process | Updates only `currentAction`, `lastAssistantMessage`, reset signals → broadcast `status:update` |
| Release | Transition to `idle`/`inactive`, tab deletion, shutdown |

**Key**: the JSONL watcher normally touches only metadata. The one exception is the synthetic `interrupt` event (see "Synthetic Interrupt Event") — it is the only path where the JSONL watcher drives a `cliState` transition, and it does so by going through the standard `updateTabFromHook` pipeline rather than bypassing it. There used to be an automatic `busy → ready-for-review` promotion path, but that was removed; only the `stop` hook triggers `ready-for-review`.

---

## Metadata Poll

A **metadata-only** poll that does not touch `cliState`.

### Cadence

| Tab count | Interval |
| --- | --- |
| 1–10 | 30s |
| 11–20 | 45s |
| 21+ | 60s |

### Cost per poll

| Operation | Count |
| --- | --- |
| `tmux list-panes -a` | 1 (single batch) |
| Filesystem reads (workspace/layout JSON) | workspace count + α |
| Process check (`pgrep`/`ps`) | only for tabs caught by the busy stuck check |
| JSONL tail read | 1 per newly discovered tab (existing tabs go through the watcher path) |

### What Each Poll Does

- New tab found → `readTabMetadata` loads initial metadata + creates entry
  - Persisted `cliState === 'busy'` → converted to `'unknown'` + `resolveUnknown` scheduled
- Existing tab → updates process/ports/title/summary (cliState untouched)
- Busy stuck check → 10 minutes elapsed + Claude process dead → silent `idle`
- Deleted tabs → cleanup + `broadcastRemove`

Removing the `cliState` decision and the `hasPermissionPrompt` check has reduced poll cost by roughly 80% compared to pre-Phase 1.

---

## Data Flow

```
[Claude Code Hook]
  ~/.purplemux/status-hook.sh
  └─ curl POST /api/status/hook
     │
     ▼
[/api/status/hook] (x-pmux-token required)
  └─ globalThis.__pt<Provider>HookEvents.emit('hook', ...)
     │
     ▼
[Provider observer] (attached per tab via attachWorkStateObserver)
  ├─ filter by tmuxSession
  ├─ apply provider-specific meta (codex applyCodexHookMeta)
  └─ translate → emit(TAgentWorkStateEvent)
     │
     ▼
[StatusManager.handleObserverEvent → updateTabFromHook]
     │
     ├─ entry.eventSeq++
     ├─ entry.lastEvent = { name, at, seq }
     ├─ broadcast status:hook-event
     ├─ deriveStateFromEvent → newState
     └─ if prevState !== newState:
         ├─ applyCliState (idempotent guard + push notification)
         ├─ persistToLayout (layout JSON)
         └─ broadcast status:update
             │
             ▼
[JSONL Watcher] (parallel)
  Watches only busy/needs-input/unknown/ready-for-review tabs
  On file change: checkJsonlIdle → updates currentAction/lastAssistantSnippet
  └─ broadcast status:update (cliState unchanged)
             │
             ▼
[Metadata Poll] (parallel, 30–60s)
  - Detect new / removed tabs
  - Update process/ports/summary
  - Busy stuck safety net
  - Persisted busy → unknown conversion + resolveUnknown
             │
             ▼
[Status WebSocket] /api/status
  Server → client: status:sync / status:update / status:hook-event
  Client → server: status:tab-dismissed / status:ack-notification / status:request-sync
             │
             ▼
[Zustand store] useTabStore
  syncAllFromServer / updateFromServer (metadata + cliState)
  applyHookEvent (lastEvent/eventSeq, prevents seq reordering)
  dismissTab / cancelTab (local actions)
             │
             ▼
[UI components]
  TabStatusIndicator         tab-bar indicator
  WorkspaceStatusIndicator   sidebar workspace
  PermissionPromptItem       timeline, re-fetched via lastEvent.seq
  NotificationSheet          notification sheet
  Bell icon                  sidebar + app header
  useBrowserTitle            browser tab title
```

### Terminal WS Path (Process Detection, Independent of cliState)

Agent identity checks in `/api/check-agent` and the Claude/Codex session detectors share `agent-process-identity.ts` with local process management. They classify the executable or a known Node/Bun CLI script, using `process-utils.getProcessArgv` to preserve argument boundaries (Linux procfs, macOS `sysctl(KERN_PROCARGS2)` via the existing Koffi dependency). macOS reads only the declared argc arguments, preserving spaces and empty arguments while excluding environment data; failures never fall back to splitting `ps` display text. Runtime detection resolves absolute npm bin script links before checking the package path. Provider names in prompts, paths or search-command arguments do not identify an agent; Claude PID registrations and resume fallback use the same check. Failed identity checks skip PID registrations without deleting them, since unreadable argv does not prove the registration is stale. This keeps a Codex tab attached to Codex when switching between Chat and Terminal, without changing `cliState` or the mode menu's timeout and timestamp guards.

```
tmux title change → onTitleChange
  ├─ formatTabTitle → updates tab display name
  └─ fetch /api/check-claude
      └─ isClaudeRunning(panePid)
          └─ setAgentProcess(tabId, true | false)
              (auto-transitions: check→timeline on true, timeline→session-list on false)
```

### Timeline WS Path (Sessions + Entries)

```
Timeline WS connects → server runs detectActiveSession
  ├─ session-changed → reflected in agentProcess
  ├─ timeline:init → entries received, isTimelineLoading = false
  └─ timeline:append → entries appended
      └─ useTimeline.onSync callback
          ├─ setAgentProcess(tabId, true | false)
          ├─ setAgentInstalled(tabId, false) (if not-installed)
          └─ setTimelineLoading(tabId, loading)
```

`useTimeline` **no longer derives `cliState` locally** (the old `deriveCliState` was removed). The timeline WS handles only metadata (entries, summaries); `cliState` is updated solely via the hook path.

Timeline display snapshots can make `isTimelineLoading` false before WebSocket initialization on a returning tab. They restore only the latest confirmed round and display metadata, never `agentProcess`, `cliState`, JSONL paths or pagination cursors. A fresh `timeline:init` replaces the snapshot; session changes, ending and resume invalidate it. Initial statistics arrive separately via `timeline:stats-update` and are accepted only for the current session.

While a new session waits for its JSONL file, `session-waiting` removes confirmed records from the old session but preserves local pending user messages, including attachment placeholders, for subsequent init/append confirmation.

---

## Queued Input Delivery Feedback

The shared desktop/mobile Web input bar keeps its red stop square at the right edge whenever `useWebInput` selects interrupt mode (`busy` or `needs-input`), regardless of draft text, attachments or an in-flight enqueue request. A separate send button appears to its left when there is draft content or an enqueue request in progress. Stopping uses the existing confirmation dialog and interrupt channel, preserving unsent text and attachments; a disconnected terminal disables the stop control. This applies to both Codex and Claude and does not infer execution from pending messages. See [the delivery and stop-control specification](../.specs/v22/changes/codex-input-delivery-stall/spec.md).

Message delivery state is independent of `TCliState`. Ordinary Web input immediately creates a pending user bubble with the queue message ID. Queue snapshots update its queued/sending/unconfirmed/failed label. Only a matching new transcript user message confirms it in place; the normal queued path does not use the legacy one-second pending fade. Canceling a queued input removes its pending bubble; an enqueue request failure removes the optimistic bubble and preserves the draft.

Cancellation removes the bubble only when the server snapshot includes the message in `canceledIds`. A successful DELETE response alone is insufficient: delivery may have started after the client's last poll, in which case the server keeps the in-flight item and the UI must keep its pending bubble.

Codex queued delivery keeps the original text and attachments until the current native transcript contains a matching user record after the attempt timestamp. It checks terminal readiness and reads the transcript incrementally on the server, independently of mounted browser panels. A 30-second receipt timeout retains the message with an explicit unconfirmed error and blocks automatic retry. Every five seconds after timeout it checks for a late receipt without writing, allowing confirmed delivery to release the queue. Explicit retry also checks for a late receipt before writing again. Busy changes and old identical transcript entries cannot acknowledge delivery. Immediate question answers and Claude terminal submission retain their existing behavior. Queue storage remains process-local; this does not add restart recovery.

The `input-queue` logger records writing, confirmation and confirmation timeout with tab/session/message IDs, without recording message text. These records distinguish terminal command completion from native receipt; they do not claim a terminal write alone guarantees delivery.

Receipt initialization scans back to the attempt timestamp rather than only the latest user turn, then continues incrementally. It prefers the status manager's bound JSONL path after verifying its native `session_meta` ID, so a session created more than 30 days ago is still eligible. Reconnect reconciliation retains the queue ID of already consumed native records (timestamp, text and images), before matching remaining pending messages.

Queue snapshots also expose `attempts` (message ID and server attempt timestamp). These survive successful dequeue and are cleared when the tab disappears or the server restarts; no extra message bodies are retained. Desktop and mobile clients synchronize these boundaries after creating queue placeholders. Pending queue messages without a server attempt cannot consume transcript records, even in a fresh client with no cached ownership; `createdAt` is never a receipt boundary. A late attempt snapshot reconciles already appended records, covering delivery that finishes between polls. Snapshots lacking this metadata leave messages pending rather than guessing delivery.

After image identities match, receipt text comparison accepts Codex's leading sequential `[Image #1]` markers, including multiple images and image-only input. It also checks the unmodified text and never removes labels in the middle of a message or from plain text without verified image attachments. Timeline display retains the original native text.

Claude base64 images carry SHA-256 identities of decoded bytes; queue API responses include server-computed identities of uploaded image files. The UI reconciles matching attachments even when the enriched queue snapshot follows the native record. Queue snapshots also expose explicit `canceledIds`, retained independently of successful dequeue until the tab disappears or the server restarts. Other clients remove only these canceled placeholders; absence from the queue alone never acknowledges or deletes a pending bubble.

## Logging Configuration

### Global Level

```bash
LOG_LEVEL=debug pnpm dev      # all groups
```

### Per-module Level

The `LOG_LEVELS` env var splits levels per group. `createLogger(name)` applies the group's level to a child logger.

```bash
# Trace only the Claude Code hook behavior in debug
LOG_LEVELS=hooks=debug pnpm dev

# Multiple groups at once
LOG_LEVELS=hooks=debug,status=warn pnpm dev
```

Main groups:

| Group | Source | Debugging target |
| --- | --- | --- |
| `hooks` | `api/status/hook.ts`, `status-manager.ts` (`hookLog`) | Hook receive/process/transition |
| `status` | `status-manager.ts` (`log`) | Poll, JSONL watcher, broadcast |
| `tmux` | `lib/tmux.ts` | tmux command execution |

With `hooks=debug` you see, for example:

- `[hooks] received { event, session }` — hook endpoint received
- `[hooks] no tabId for session` / `no entry for tab` — failure cases
- `[hooks] processed { tabId, event, seq, prevState, newState, transition }` — processing result

### How It Works

`src/lib/logger.ts` parses `LOG_LEVELS`, sets the root logger's level to the minimum across groups, then `createLogger(name)` applies each group's level to its child logger. Pino requires the root to be open down to the lowest level for child filtering to work.

---

## Related Files

### Types

| File | Description |
| --- | --- |
| `src/types/status.ts` | `ITabStatusEntry`, `ILastEvent`, `TEventName`, `TTabDisplayStatus`, WebSocket messages |
| `src/types/timeline.ts` | `TCliState`, `TSessionDetectionStatus` (server-only) |

### Server

| File | Description |
| --- | --- |
| `src/lib/status-manager.ts` | `deriveStateFromEvent`, `updateTabFromHook`, `applyCliState`, `resolveUnknown`, `readTabMetadata`, busy stuck safety net, metadata poll, JSONL watcher |
| `src/lib/status-server.ts` | `/api/status` WebSocket handler |
| `src/lib/hook-settings.ts` | Hook settings file generation, script management |
| `src/pages/api/status/hook.ts` | Hook API endpoint (x-pmux-token required) |
| `src/lib/session-detection.ts` | `detectActiveSession`, `isClaudeRunning` |
| `src/pages/api/check-claude.ts` | Claude process detection API |
| `src/lib/layout-store.ts` | `updateTabCliStatus`, etc. (layout JSON writes) |
| `src/lib/logger.ts` | `LOG_LEVELS` parsing + per-group pino child |

### Client

| File | Description |
| --- | --- |
| `src/hooks/use-tab-store.ts` | Zustand tab store, `applyHookEvent`, `selectTabDisplayStatus` |
| `src/hooks/use-claude-status.ts` | Status WebSocket, `status:hook-event` / `status:update` handling, `dismissTab` |
| `src/hooks/use-timeline.ts` | Timeline WS data (no cliState derivation) |
| `src/hooks/use-web-input.ts` | Input mode decision (`unknown` allows input) |
| `src/hooks/use-native-notification.ts` | Desktop native notifications |
| `src/hooks/use-browser-title.ts` | Browser title attention count |

### UI Components

| File | Role |
| --- | --- |
| `src/components/features/workspace/tab-status-indicator.tsx` | Tab-bar indicator |
| `src/components/features/workspace/workspace-status-indicator.tsx` | Sidebar workspace dot |
| `src/components/features/mobile/mobile-workspace-tab-bar.tsx` | Mobile tab bar |
| `src/components/features/timeline/permission-prompt-item.tsx` | Permission prompt UI (`lastEvent.seq` subscriber) |
| `src/components/features/workspace/notification-sheet.tsx` | Notification sheet + `useNotificationCount` |

---

## Notification System

Pending question metadata belongs to its agent session. When polling detects a new session, an unknown question snapshot clears the previous session's list; a transient read failure within the same session preserves its list. Successful snapshots replace it, including an empty list. Question toast navigation validates the current workspace as well as provider, session and question identity before opening the captured target.

### Notification Sheet (`NotificationSheet`)

Shown as a Sheet when the Bell icon is clicked. Four sections: in-progress (`busy`), awaiting input (`needs-input`), review (`ready-for-review`), done (`done`).

The done section shows tabs that were acknowledged via `dismissTab` (have a `dismissedAt` value and `cliState` is `idle`/`inactive`), excluding the currently active tab, sorted by recency. When new work starts on such a tab, `dismissedAt` is reset and the tab leaves the list.

### Count Aggregation Scope

The `useNotificationCount` hook walks all tabs and aggregates `busy` / `needs-input` / `ready-for-review`. The currently active tab is included, so the sidebar, app header, and notification sheet share the same count and the number does not drop just because you opened the tab.

### `unknown` Handling

Tabs in `unknown` are **excluded** from both attention and busy counts. This is intentional, so the indeterminate state right after a restart does not raise a notification. Only the sidebar badge shows quietly as a gray dot.

### Push Notification Policy

Auto-fired from the `applyCliState` call path:

- `newState === 'ready-for-review'` → web push "Task Complete"
- `newState === 'needs-input'` → web push "Input Required"

The idempotent guard at the top of the function (`prevState === newState`) blocks duplicate calls, so callers don't have to track state.

"Silent" paths such as `resolveUnknown` / `dismissTab` / busy-stuck safety net / server restart recovery suppress the push by passing `{ silent: true }`.

## Session 工作状态（2026-10-13）

Chat 状态菜单的 Portal 在自身边界隔离鼠标按下及 Escape 事件，避免触发桌面详情的外部关闭监听。菜单选择保持已展开详情，Escape 先关闭菜单，之后再次 Escape 或真正外部点击仍关闭详情。

Claude/Codex Chat 的桌面和移动面板共用顶部会话头部，提供工作状态选择，复用 Sessions 的推导、保存与同步逻辑；自动模式展示实际阶段。状态选择独立于桌面详情展开及移动详情 Sheet，不改变 TCliState 或停止模型。保存期间只读且保留原触发器，菜单关闭后由 Select 恢复焦点，避免成功或失败后键盘焦点丢失；保存结果不主动抢回用户已移走的焦点。元信息加载、断连、当前 Tab 与展示身份不一致、首次 fallback 状态尚未迁移或目标已删除时禁止编辑，避免缓存会话串写。

2026-10-14：`sessionWorkflow.titles` 另外保存 Claude/Codex 在本应用中手动命名的会话标题，按代理与原生会话 ID 索引。尚无 ID 时按 Tab 暂存，首次绑定时迁移；删除会话清理标题。该字段只影响展示，不参与工作状态计算或修改代理原生会话文件。

PR #36 Review：会话身份切换时，布局记录、状态管理与客户端状态均清除上一会话的摘要和用户消息回退，防止新身份短暂展示旧标题。`sessionWorkflow.renamedTabs` 与标题在同一配置写入中保存，标记当前 Tab 使用会话标题而非旧布局名称。

Session 工作状态独立于 TCliState，由 session-workflow 的共享纯函数解析。人工覆盖及分类折叠存于 workspaces.json/sessionWorkflow，通过 workspace 广播同步。未覆盖时 busy/needs-input 为进行中，单轮产出为审批中，未执行为未开始；完成仅人工确认。关闭通知不确认工作完成。Workspace 汇总去重后的本工作区 sessions，优先级为进行中、审批中、未开始，全部完成才已完成。模型 Todo/Plan 仍是会话内部执行计划，不作为 Workspace 完成依据。

Review 修复：sessionWorkflow.sessions 保存独立会话索引（关联及最近一轮摘要），tabBindings 在首次绑定时消费 Tab fallback 人工状态。索引先于轮次历史裁剪持久化，GET Workspace 回补，状态更新使用快照写入；人工确认不被后续会话继承。历史导航按 provider/session ID 判断当前会话，useSync 每次连接建立均补拉 Workspace；删除时同步清除索引。

第二轮 Review：sessionWorkflow.deleted 与索引同锁写入，回补同锁读取 hidden-sessions 并排除删除键；客户端同样过滤删除键。无轮次索引的 navigation 保存原生身份、Workspace 名称/目录与 Tab ID，独立于轮次历史；导航和删除均使用该身份，不把复用 Tab 上的新会话当作旧索引的目标。

第三轮 Review：原生身份已隐藏/删除仍消费首次绑定 fallback 的状态与索引并记录 tabBindings，不迁移至删除身份；后续新身份使用自身自动或人工状态。无轮次行以 DOM 元素承接真实菜单事件与 ref，支持右键、移动端长按及取消手势。
