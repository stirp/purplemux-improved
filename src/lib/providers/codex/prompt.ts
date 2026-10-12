import fs from 'fs/promises';
import path from 'path';
import { resolveLayoutDir } from '@/lib/layout-store';
import type { IWorkspace } from '@/types/terminal';

export const getCodexPromptPath = (workspaceId: string): string =>
  path.join(resolveLayoutDir(workspaceId), 'codex-prompt.md');

export const sanitizeForTomlTripleQuote = (s: string): string =>
  s.replace(/'''/g, "' ''");

export const toTomlBasicString = (s: string): string => JSON.stringify(s);

const buildBody = (ws: IWorkspace): string => {
  const raw = `# purplemux-improved context

You are running inside a purplemux-improved workspace tab via OpenAI Codex CLI.

- **Workspace ID**: \`${ws.id}\`

Use \`purplemux-improved workspaces\` if you need the workspace name or directories.

## purplemux-improved CLI

The \`purplemux-improved\` CLI lets you inspect and control other tabs in this workspace.
It reads port and token from \`~/.purplemux/{port,cli-token}\` automatically,
so no environment setup is needed.

### Commands

\`\`\`bash
purplemux-improved features                                  # offline guide to fork features
purplemux-improved worktree --help                            # create, inspect, sync and deliver worktrees
purplemux-improved queue --help                               # queued input and immediate answers
purplemux-improved session --help                             # history, entries and live status
purplemux-improved commit --help                              # inspect, generate and commit
purplemux-improved workspaces                                # list all workspaces
purplemux-improved tab list -w ${ws.id}                        # list tabs in this workspace
purplemux-improved tab create -w ${ws.id} [-n NAME] [-t TYPE]  # create a tab (type: terminal | claude-code | codex-cli | agent-sessions | web-browser | diff)
purplemux-improved tab send -w ${ws.id} TAB_ID CONTENT...      # send input to a tab
purplemux-improved tab status -w ${ws.id} TAB_ID               # tab status
purplemux-improved tab result -w ${ws.id} TAB_ID               # capture current pane content
purplemux-improved tab close -w ${ws.id} TAB_ID                # close a tab
\`\`\`

For the full HTTP API reference (including endpoint paths and payloads),
run:

\`\`\`bash
purplemux-improved api-guide
\`\`\`

### When to use

- Delegate work to another tab when a task benefits from isolation
  (long-running builds, different project context, parallel exploration).
- Poll \`status\` and read \`result\` to verify delegated work.
- Prefer small, scoped tabs over cramming everything into one session.

### Tab type notes

- **\`web-browser\` tabs**: Electron webviews, not tmux. The \`alive\` field in
  \`tab list\` / \`tab status\` is always \`false\` for these — that is the normal
  value, not a sign the tab is dead. Do not gate actions on \`alive\`. Use the
  browser-specific HTTP endpoints (\`/browser/url\`, \`/browser/screenshot\`, …;
  see \`purplemux-improved api-guide\`) directly.
- **\`terminal\` / \`claude-code\` / \`codex-cli\` tabs**: run inside tmux, so
  \`alive\` is a valid liveness signal.
`;
  return sanitizeForTomlTripleQuote(raw);
};

export const writeCodexPromptFile = async (ws: IWorkspace): Promise<void> => {
  const filePath = getCodexPromptPath(ws.id);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const body = buildBody(ws);
  try {
    const existing = await fs.readFile(filePath, 'utf-8');
    if (existing === body) return;
  } catch {
    // missing — write below
  }
  await fs.writeFile(filePath, body, 'utf-8');
};
