'use strict';

const fs = require('node:fs');
const path = require('node:path');

// One catalog drives dispatch, offline help, and the HTTP reference.
const commands = [];
const add = (name, method, endpoint, description, required = [], optional = [], fixed = {}) =>
  commands.push({ name, method, endpoint, description, required, optional, fixed });
const ws = ['workspaceId'];
const snapshot = ['repositoryId', 'directory', 'head', 'branch'];
add('workspace list', 'GET', '/api/workspace', 'List workspaces, groups and active workspace.');
add('workspace create', 'POST', '/api/workspace', 'Register a directory; optionally resume an agent session.', ['directory'], ['name', 'resumeSessionId', 'panelType']);
add('workspace update', 'PATCH', '/api/workspace/:workspaceId', 'Rename or move a workspace to a group (groupId=null ungroups).', ws, ['name', 'groupId']);
add('workspace delete', 'DELETE', '/api/workspace/:workspaceId', 'Delete workspace; original agent records are deleted by default. Use --delete-sessions false to retain them.', ws, ['deleteSessions']);
add('workspace directories', 'GET', '/api/workspace/directories', 'Browse server directories.', [], ['directory']);
add('workspace reorder', 'PATCH', '/api/workspace/reorder', 'Reorder workspaces with items [{id,groupId?},...].', ['items']);
add('group create', 'POST', '/api/workspace/group', 'Create a workspace group. List groups with workspace list.', ['name']);
add('group update', 'PATCH', '/api/workspace/group/:groupId', 'Rename or collapse/expand a group.', ['groupId'], ['name', 'collapsed']);
add('group delete', 'DELETE', '/api/workspace/group/:groupId', 'Ungroup workspaces and remove the group.', ['groupId']);
add('group reorder', 'PATCH', '/api/workspace/group/reorder', 'Set group order with a JSON array of group IDs.', ['groupIds']);
add('worktree source', 'GET', '/api/workspace/worktree', 'Inspect source repository and available branches.', ws, ['directoryIndex']);
add('worktree list', 'GET', '/api/workspace/worktrees', 'List repositories, worktree snapshots, status and blockers.', ws);
add('worktree create', 'POST', '/api/workspace/worktree', 'Create a branch, worktree and child workspace.', [...ws, 'name', 'branch'], ['directoryIndex', 'baseRef']);
add('worktree generate-branch', 'POST', '/api/workspace/generate-branch-name', 'Generate a branch name with tool-free Claude (does not create it).', [...ws, 'title'], ['directoryIndex', 'baseRef']);
add('worktree adopt', 'POST', '/api/workspace/worktrees', 'Register an existing worktree as a workspace.', [...ws, 'repositoryId', 'directory']);
add('worktree remove', 'DELETE', '/api/workspace/worktrees', 'Remove a worktree using a reviewed snapshot; server enforces blockers.', [...ws, ...snapshot], ['deleteBranch', 'closeIdleSessions', 'discardUnmergedBranch', 'targetRef', 'confirmedIgnoredPaths']);
for (const [name, action, description, required, optional] of [
  ['measure', 'measure', 'Measure worktree disk usage.', ['item'], []],
  ['preview-cleanup', 'previewCleanup', 'Preview batch cleanup blockers and ignored files.', ['items'], []],
  ['cleanup', 'cleanup', 'Remove reviewed worktrees; inspect per-item results for partial failures.', ['items'], []],
  ['inspect-sync', 'inspectSync', 'Inspect sync targets, targetHead, blockers and review link.', ['item'], ['targetRef']],
  ['fetch', 'fetch', 'Fetch remote refs.', ['item'], []],
  ['merge', 'merge', 'Merge a reviewed target into the worktree.', ['item', 'targetRef', 'targetHead'], []],
  ['rebase', 'rebase', 'Rebase onto a reviewed target.', ['item', 'targetRef', 'targetHead'], []],
  ['continue', 'continue', 'Continue the current merge/rebase after resolving conflicts.', ['item'], []],
  ['abort', 'abort', 'Abort the current merge/rebase.', ['item'], []],
  ['save-review', 'saveReview', 'Save a PR/MR URL, or null to unlink.', ['item', 'url'], []],
  ['refresh-review', 'refreshReview', 'Refresh PR/MR state through the hosting CLI.', ['item'], []],
  ['push', 'pushBranch', 'Push the worktree branch to the specified remote.', ['item', 'remote'], []],
  ['generate-draft', 'generateDraft', 'Generate a draft title/body without publishing.', ['item', 'remote', 'targetBranch'], ['locale']],
  ['create-draft', 'createDraft', 'Create a draft PR/MR (provider: github or gitlab).', ['item', 'remote', 'provider', 'targetBranch', 'title', 'body'], []],
]) add(`worktree ${name}`, 'POST', '/api/workspace/worktree-actions', description, [...ws, ...required], optional, { action });
add('commit inspect', 'POST', '/api/git/commit', 'Preview files and capture the commit snapshot.', ['session'], [], { action: 'inspect' });
add('commit generate', 'POST', '/api/git/commit', 'Generate title/body and snapshot without committing.', ['session', 'locale'], [], { action: 'generate' });
add('commit create', 'POST', '/api/git/commit', 'Commit reviewed changes using snapshot and message {title,body}.', ['session', 'snapshot', 'message'], [], { action: 'commit' });
add('session claude', 'GET', '/api/timeline/sessions', 'List visible Claude sessions for a tmux session.', ['tmuxSession'], ['cwd', 'limit', 'offset']);
add('session codex', 'GET', '/api/codex/sessions', 'List visible Codex sessions in a directory.', ['cwd'], ['daysBack']);
add('session entries', 'GET', '/api/timeline/entries', 'Read session entries including tool/plan events; mode=turn loads a complete turn.', ['jsonlPath', 'beforeByte'], ['limit', 'untilByte', 'mode']);
for (const provider of ['claude', 'codex']) {
  add(`session ${provider}-status`, 'GET', `/api/${provider}/status-line`, 'Read actual terminal status text, matched to the active agent session.', [...ws, 'tabId', 'sessionId']);
}
add('session delete', 'DELETE', '/api/session-history', 'Hide/remove history; --delete-original true also deletes source records. Active records are protected.', ['provider', 'sessionId'], ['historyEntryId', 'deleteOriginal']);
add('queue list', 'GET', '/api/input-queue', 'Read queued input for a tab.', [...ws, 'tabId']);
add('queue add', 'POST', '/api/input-queue', 'Queue text/attachments; id identifies the message. Text or attachments required.', [...ws, 'tabId', 'id'], ['text', 'attachments'], { text: '', attachments: [] });
add('queue submit', 'POST', '/api/input-queue', 'Flush queued input now.', [...ws, 'tabId'], [], { action: 'submit-now' });
add('queue answer', 'POST', '/api/input-queue', 'Send an immediate answer bound to the current agentSessionId.', [...ws, 'tabId', 'id', 'agentSessionId'], ['text', 'attachments'], { action: 'send-immediate', text: '', attachments: [] });
add('queue remove', 'DELETE', '/api/input-queue', 'Remove one queued message.', [...ws, 'tabId', 'id']);
add('config get', 'GET', '/api/config', 'Read server settings (includes configured Codex environment values).');
add('config set', 'PATCH', '/api/config', 'Update fork settings; codexEnvironment replaces the complete environment map.', [], ['codexEnvironment', 'branchNameProvider', 'branchNamePrompt', 'commitMessagePrompt', 'reviewDescriptionPrompt', 'editorUrl', 'editorPreset']);
add('codex launch-args', 'POST', '/api/codex/launch-args', 'Inspect Codex launch arguments and environment.', [], ['workspaceId', 'resumeSessionId']);
add('upload file', 'UPLOAD', '/api/upload-file', 'Upload a local file (1 byte–50 MiB); returns attachment path and filename.', ['file'], ['workspaceId', 'tabId']);

const groups = [...new Set(commands.map((command) => command.name.split(' ')[0]))];
const flag = (field) => '--' + field.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
const jsonFields = new Set(['item', 'items', 'snapshot', 'message', 'attachments', 'confirmedIgnoredPaths', 'codexEnvironment', 'groupIds']);
const booleanFields = new Set(['deleteSessions', 'deleteBranch', 'closeIdleSessions', 'discardUnmergedBranch', 'deleteOriginal', 'collapsed']);
const numberFields = new Set(['directoryIndex', 'limit', 'offset', 'daysBack', 'beforeByte', 'untilByte']);
const nullableFields = new Set(['branch', 'url', 'groupId', 'sessionId']);
const readJson = (input) => {
  const value = JSON.parse(input === '-' ? fs.readFileSync(0, 'utf8') : input.startsWith('@') ? fs.readFileSync(input.slice(1), 'utf8') : input);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('--data must contain a JSON object');
  return value;
};
const parse = (command, args) => {
  const allowed = [...command.required, ...command.optional];
  const values = {};
  let data = {};
  let hasData = false;
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const raw = args[i + 1];
    if (raw === undefined || raw.startsWith('--')) throw new Error(`Missing value for ${name}`);
    if (name === '--data') {
      if (hasData) throw new Error('--data may only be supplied once');
      data = readJson(raw);
      hasData = true;
      continue;
    }
    const field = allowed.find((field) => name === flag(field) || (field === 'workspaceId' && ['-w', '--workspace'].includes(name)));
    if (!field) throw new Error(`Unknown option: ${name}`);
    if (Object.hasOwn(values, field)) throw new Error(`Duplicate option: ${name}`);
    if (jsonFields.has(field)) values[field] = JSON.parse(raw);
    else if (booleanFields.has(field)) {
      if (!['true', 'false'].includes(raw)) throw new Error(`${name} requires true or false`);
      values[field] = raw === 'true';
    } else if (numberFields.has(field)) {
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error(`${name} requires a non-negative integer`);
      values[field] = Number(raw);
    } else values[field] = nullableFields.has(field) && raw === 'null' ? null : raw;
  }
  for (const key of Object.keys(data)) if (!allowed.includes(key)) throw new Error(`Unknown data field: ${key}`);
  const result = { ...command.fixed, ...data, ...values };
  for (const key of command.required) {
    if (result[key] === undefined || result[key] === '') throw new Error(`${flag(key)} is required (or provide ${key} in --data)`);
  }
  if (['config set', 'workspace update', 'group update'].includes(command.name) && !command.optional.some((key) => result[key] !== undefined)) {
    throw new Error('At least one setting to update is required');
  }
  return result;
};

const help = (prefix = '') => {
  const selected = commands.filter((command) => !prefix || command.name === prefix || command.name.startsWith(prefix + ' '));
  if (!selected.length) throw new Error(`Unknown command: ${prefix}`);
  return `Fork feature commands (offline help)\n\n${selected.map((command) => {
    const fields = [...command.required.map((field) => `${flag(field)} VALUE`), ...command.optional.map((field) => `[${flag(field)} VALUE]`)];
    return `purplemux ${command.name}\n  ${command.description}\n  ${command.method === 'UPLOAD' ? 'POST (binary)' : command.method} ${command.endpoint}\n  ${fields.join(' ')}${Object.keys(command.fixed).length ? `\n  Fixed/default body: ${JSON.stringify(command.fixed)}` : ''}`;
  }).join('\n\n')}\n\nUse -w/--workspace for --workspace-id. All options take a value.\nUse --data '{"field":"value"}', --data @request.json, or --data - (stdin).\nExplicit flags override --data. Unknown fields/options fail before any request.\nObjects/arrays use JSON; booleans use true/false. IDs are not shell commands.\nWorktree item = {repositoryId,directory,head,branch,confirmedIgnoredPaths?}; items = [item,...].\nGet repositoryId from worktree list repositories[].id and snapshot fields from worktrees[].\nCommit snapshot comes from commit inspect/generate; message = {title,body}.\nMerge/rebase require targetHead from inspect-sync. Re-read snapshots after changes.\nCLI token/port fall back to ~/.purplemux/{cli-token,port}. Only requests need a server.\nGET fields use query parameters; other fields use JSON body, except path IDs and\nqueue workspaceId/tabId (query). Upload uses binary body and X-Pmux-* headers.\n\nExamples (replace IDs, paths and snapshot files with reviewed values):\n  purplemux workspace directories --directory /home/me/projects\n  purplemux workspace create --directory /home/me/projects/app --name App\n  purplemux worktree list -w ws-EXAMPLE\n  purplemux worktree generate-branch -w ws-EXAMPLE --title "Fix login"\n  purplemux worktree create -w ws-EXAMPLE --name "Fix login" --branch fix/login\n  purplemux worktree inspect-sync -w ws-EXAMPLE --data @item.json --target-ref refs/remotes/origin/main\n  purplemux commit generate --session TMUX_SESSION --locale en\n  purplemux queue add -w ws-EXAMPLE --tab-id TAB_ID --id msg-1 --text "Run tests next"\n  purplemux upload file --file ./design.pdf -w ws-EXAMPLE --tab-id TAB_ID\n  purplemux session codex --cwd /home/me/projects/app\n  purplemux config set --codex-environment '{"EXAMPLE_VARIABLE":"value"}'\n  purplemux codex launch-args -w ws-EXAMPLE\n  purplemux tab rename -w ws-EXAMPLE TAB_ID "Review"\n\nUI-only changes (auto-hide, touch dragging, browser storage cleanup, slash-menu\ndisplay and terminal flow control) remain in the browser/runtime.\n`;
};

const run = async (args, { api, requireEnv, out, upload }) => {
  const [group, sub, ...rest] = args;
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    process.stdout.write(help(group));
    return;
  }
  const command = commands.find((command) => command.name === `${group} ${sub}`);
  if (!command) throw new Error(`Unknown command: ${group} ${sub}. Run 'purplemux ${group} --help'.`);
  if (rest.some((arg, index) => index % 2 === 0 && ['--help', '-h'].includes(arg))) {
    process.stdout.write(help(command.name));
    return;
  }
  const data = parse(command, rest);
  requireEnv();
  if (command.method === 'UPLOAD') {
    const stat = fs.statSync(data.file);
    if (!stat.isFile() || stat.size === 0 || stat.size > 50 * 1024 * 1024) throw new Error('Upload requires a non-empty file of at most 50 MiB');
    out(await upload(command.endpoint, fs.readFileSync(data.file), {
      'Content-Type': 'application/octet-stream',
      'X-Pmux-Filename': encodeURIComponent(path.basename(data.file)),
      ...(data.workspaceId ? { 'X-Pmux-Ws-Id': data.workspaceId } : {}),
      ...(data.tabId ? { 'X-Pmux-Tab-Id': data.tabId } : {}),
    }));
    return;
  }
  let endpoint = command.endpoint;
  for (const key of ['workspaceId', 'groupId']) {
    if (endpoint.includes(`:${key}`)) {
      endpoint = endpoint.replace(`:${key}`, encodeURIComponent(data[key]));
      delete data[key];
    }
  }
  const query = new URLSearchParams();
  for (const key of Object.keys(data)) {
    if (command.method === 'GET' || (group === 'queue' && ['workspaceId', 'tabId'].includes(key))) {
      query.set(key, String(data[key]));
      delete data[key];
    }
  }
  if (query.size) endpoint += '?' + query.toString();
  const { body } = await api(command.method, endpoint, command.method === 'GET' ? undefined : data);
  out(body ?? { ok: true });
  if (body?.ok === false || body?.results?.some((result) => result.ok === false)) process.exitCode = 1;
};

module.exports = { commands, groups, help, parse, run };
