const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { commands } = require('../../bin/feature-commands');

const root = path.resolve(__dirname, '../..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pmux-cli-test-'));
const requests = [];
let server;
let port;
let reply = { status: 200, body: { ok: true } };
before(async () => {
  server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, url: req.url, headers: req.headers, raw: Buffer.concat(chunks) });
    res.writeHead(reply.status, { 'Content-Type': 'application/json' });
    res.end(reply.status === 204 ? undefined : JSON.stringify(reply.body));
  });
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

const cli = (args, input = '', env = {}) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'bin/purplemux.js'), ...args], {
    cwd: root,
    env: { ...process.env, HOME: tmp, PMUX_PORT: String(port), PMUX_TOKEN: 'test-token', NO_UPDATE_NOTIFIER: '1', ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout, stderr }));
  child.stdin.end(input);
});

const item = { repositoryId: '/repo/.git', directory: '/repo/worktree', head: 'a'.repeat(40), branch: 'feat/example' };
const samples = {
  groupId: 'group-1', groupIds: ['group-1'],
  workspaceId: 'ws-example', directory: '/repo with spaces', name: 'CLI example', branch: 'feat/example', title: 'Example',
  repositoryId: '/repo/.git', head: 'a'.repeat(40), item, items: [item], targetRef: 'refs/remotes/origin/main',
  targetHead: 'b'.repeat(40), url: 'https://github.com/example/repo/pull/1', remote: 'origin', targetBranch: 'main',
  provider: 'codex', body: 'Review body', session: 'pmux-session', locale: 'zh-CN', snapshot: { ...item, tree: 'c'.repeat(40) },
  message: { title: 'fix: example', body: '' }, tmuxSession: 'pmux-session', cwd: '/repo', sessionId: 'agent-123',
  tabId: 'tab-123', id: 'message-1', agentSessionId: 'agent-123', jsonlPath: '/tmp/session.jsonl', beforeByte: 100,
};

for (const command of commands.filter((entry) => entry.method !== 'UPLOAD')) {
  test(`${command.name} dispatches through the public binary with token, method and payload`, async () => {
    const data = Object.fromEntries(command.required.map((key) => [key, samples[key]]));
    if (['workspace update', 'group update'].includes(command.name)) data.name = 'Renamed';
    if (command.name === 'workspace reorder') data.items = [{ id: 'ws-example', groupId: null }];
    if (command.name === 'config set') data.codexEnvironment = { EXAMPLE: 'value' };
    if (command.name === 'worktree create-draft') data.provider = 'github';
    if (command.name === 'queue add' || command.name === 'queue answer') data.text = 'hello';
    const result = await cli([...command.name.split(' '), '--data', JSON.stringify(data)]);
    assert.equal(result.code, 0, result.stderr);
    const req = requests.at(-1);
    assert.equal(req.headers['x-pmux-token'], 'test-token');
    assert.equal(req.method, command.method);
    const url = new URL(req.url, 'http://localhost');
    assert.equal(url.pathname, command.endpoint.replace(':workspaceId', data.workspaceId).replace(':groupId', data.groupId));
    const expected = { ...command.fixed, ...data };
    for (const key of ['workspaceId', 'groupId']) if (command.endpoint.includes(`:${key}`)) delete expected[key];
    for (const key of Object.keys(expected)) {
      if (command.method === 'GET' || (command.name.startsWith('queue ') && ['workspaceId', 'tabId'].includes(key))) {
        assert.equal(url.searchParams.get(key), String(expected[key]));
        delete expected[key];
      }
    }
    assert.deepEqual(req.raw.length ? JSON.parse(req.raw) : {}, expected);
  });
}

test('help and feature discovery work offline through the public entrypoint', async () => {
  const count = requests.length;
  for (const args of [['--help'], ['-h'], ['features'], ['worktree', '--help'], ['help', 'commit', 'create'], ['queue', 'answer', '--help']]) {
    const result = await cli(args, '', { PMUX_PORT: '', PMUX_TOKEN: '' });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /purplemux/);
  }
  assert.equal(requests.length, count);
});

for (const alias of ['-w', '--workspace', '--workspace-id']) {
  test(`${alias} selects the same workspace in queries, bodies and paths`, async () => {
    const scenarios = [
      {
        args: ['worktree', 'list'], method: 'GET',
        url: '/api/workspace/worktrees?workspaceId=ws-example', body: null,
      },
      {
        args: ['worktree', 'create', '--name', 'Example', '--branch', 'feat/example'], method: 'POST',
        url: '/api/workspace/worktree', body: { workspaceId: 'ws-example', name: 'Example', branch: 'feat/example' },
      },
      {
        args: ['workspace', 'update', '--name', 'Renamed'], method: 'PATCH',
        url: '/api/workspace/ws-example', body: { name: 'Renamed' },
      },
    ];
    for (const scenario of scenarios) {
      const count = requests.length;
      const result = await cli([...scenario.args, alias, 'ws-example']);
      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, count + 1);
      const req = requests.at(-1);
      assert.equal(req.method, scenario.method);
      assert.equal(req.url, scenario.url);
      assert.deepEqual(req.raw.length ? JSON.parse(req.raw) : null, scenario.body);
    }
  });
}

test('mixed workspace aliases are rejected as duplicate options before sending', async () => {
  const count = requests.length;
  const result = await cli(['worktree', 'list', '-w', 'ws-first', '--workspace-id', 'ws-second']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Duplicate option: --workspace-id/);
  assert.equal(requests.length, count);
});

test('flags preserve spaces, encode queries, and override JSON from a file', async () => {
  const file = path.join(tmp, 'request.json');
  fs.writeFileSync(file, JSON.stringify({ workspaceId: 'ws-old', title: 'Old title', directoryIndex: 1 }));
  const result = await cli(['worktree', 'generate-branch', '--data', '@' + file, '-w', 'ws-new', '--title', 'A new title']);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(requests.at(-1).raw), { workspaceId: 'ws-new', title: 'A new title', directoryIndex: 1 });
  await cli(['workspace', 'directories', '--directory', '/repo/a b&c']);
  assert.equal(new URL(requests.at(-1).url, 'http://localhost').searchParams.get('directory'), '/repo/a b&c');
});

test('stdin JSON, explicit booleans, nulls and 204 responses', async () => {
  reply = { status: 204 };
  try {
    const result = await cli(['session', 'delete', '--data', '-', '--delete-original', 'false'], JSON.stringify({ provider: 'codex', sessionId: null, historyEntryId: 'entry-1' }));
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true });
    assert.deepEqual(JSON.parse(requests.at(-1).raw), { provider: 'codex', sessionId: null, historyEntryId: 'entry-1', deleteOriginal: false });
  } finally { reply = { status: 200, body: { ok: true } }; }
});

test('invalid or missing arguments never issue a request', async () => {
  const count = requests.length;
  for (const args of [
    ['worktree', 'create', '-w', 'ws-a'],
    ['worktree', 'create', '--data', '{'],
    ['worktree', 'list', '--data', '[]'],
    ['worktree', 'list', '--data', '{"workspaceId":"ws-a","unexpected":true}'],
    ['worktree', 'list', '--workspace'],
    ['worktree', 'list', '--workspace', '--data', '{}'],
    ['worktree', 'list', '-w', 'ws-a', '--typo', 'value'],
    ['workspace', 'delete', '-w', 'ws-a', '--delete-sessions', 'yes'],
    ['worktree', 'source', '-w', 'ws-a', '--directory-index', 'NaN'],
    ['config', 'set', '--data', '{}'],
    ['workspace', 'update', '-w', 'ws-a'],
    ['worktree', 'cleanup', '-w', 'ws-a', '--data', '{"action":"pushBranch","items":[]}'],
  ]) {
    const result = await cli(args);
    assert.equal(result.code, 1, args.join(' '));
    assert.match(result.stderr, /error:/);
  }
  assert.equal(requests.length, count);
});

test('HTTP errors and business failures produce a nonzero exit', async () => {
  try {
    reply = { status: 409, body: { error: 'changed', code: 'changed' } };
    const conflict = await cli(['worktree', 'list', '-w', 'ws-example']);
    assert.equal(conflict.code, 1);
    assert.match(conflict.stderr, /changed/);
    for (const body of [{ ok: false, operation: 'merge' }, { results: [{ ok: true }, { ok: false, error: 'dirty' }] }]) {
      reply = { status: 200, body };
      const failed = await cli(['worktree', 'list', '-w', 'ws-example']);
      assert.equal(failed.code, 1);
      assert.deepEqual(JSON.parse(failed.stdout), body);
    }
  } finally { reply = { status: 200, body: { ok: true } }; }
});

test('uploads send exact binary bytes and encoded filenames; empty files are rejected', async () => {
  const file = path.join(tmp, '附件 example.bin');
  const content = Buffer.from([0, 1, 255, 13, 10]);
  fs.writeFileSync(file, content);
  const result = await cli(['upload', 'file', '--file', file, '-w', 'ws-example', '--tab-id', 'tab-1']);
  assert.equal(result.code, 0, result.stderr);
  const req = requests.at(-1);
  assert.equal(req.url, '/api/upload-file');
  assert.equal(req.headers['x-pmux-token'], 'test-token');
  assert.equal(req.headers['x-pmux-ws-id'], 'ws-example');
  assert.equal(decodeURIComponent(req.headers['x-pmux-filename']), path.basename(file));
  assert.deepEqual(req.raw, content);
  fs.writeFileSync(file, '');
  const count = requests.length;
  assert.equal((await cli(['upload', 'file', '--file', file])).code, 1);
  assert.equal(requests.length, count);
});

test('legacy tab commands remain available and api-guide includes fork commands', async () => {
  assert.equal((await cli(['tab', 'list', '-w', 'ws-example'])).code, 0);
  assert.equal(requests.at(-1).url, '/api/cli/tabs?workspaceId=ws-example');
  const guide = await cli(['api-guide']);
  assert.equal(guide.code, 0, guide.stderr);
  assert.match(guide.stdout, /worktree create-draft/);
});

test('tab rename resolves the current pane and preserves workspace scope', async () => {
  reply = { status: 200, body: { paneId: 'pane-current' } };
  try {
    const result = await cli(['tab', 'rename', '-w', 'ws-example', 'tab-1', 'New title']);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.at(-2).url, '/api/cli/tabs/tab-1?workspaceId=ws-example');
    const req = requests.at(-1);
    assert.equal(req.method, 'PATCH');
    assert.equal(req.url, '/api/layout/pane/pane-current/tabs/tab-1?workspace=ws-example');
    assert.deepEqual(JSON.parse(req.raw), { name: 'New title' });
  } finally { reply = { status: 200, body: { ok: true } }; }
});

test('port and token fall back to the user configuration files', async () => {
  const dir = path.join(tmp, '.purplemux');
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'port'), String(port));
  fs.writeFileSync(path.join(dir, 'cli-token'), 'fallback-token');
  try {
    const result = await cli(['workspace', 'list'], '', { PMUX_PORT: '', PMUX_TOKEN: '' });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.at(-1).headers['x-pmux-token'], 'fallback-token');
  } finally { fs.rmSync(dir, { recursive: true }); }
});

test('attachment-only queue messages retain defaults without requiring text', async () => {
  const attachments = [{ path: '/uploads/file.pdf', filename: 'file.pdf' }];
  const result = await cli(['queue', 'add', '-w', 'ws-example', '--tab-id', 'tab-1', '--id', 'attachment-1', '--attachments', JSON.stringify(attachments)]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(requests.at(-1).raw), { text: '', attachments, id: 'attachment-1' });
});
