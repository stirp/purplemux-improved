import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async (original) => {
  const actual = await original<typeof import('os')>();
  return { ...actual, default: { ...actual, homedir: () => mocks.home } };
});
vi.mock('@/lib/preflight', () => ({ getShellPath: async () => process.env.PATH }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => ({}) }) }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: vi.fn() }) }));

// Opt in: needs a local Codex executable, but never uses real sessions or model requests.
it.runIf(process.env.PMUX_CODEX_INTEGRATION === '1')('removes a session family from native rollouts, index and thread discovery', async () => {
  mocks.home = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-codex-native-'));
  const codexRoot = path.join(mocks.home, '.codex');
  await fs.mkdir(codexRoot);
  vi.stubEnv('CODEX_HOME', codexRoot);
  const parent = '019e7f03-4378-77f1-b694-af3c181c7417';
  const review = '019e7f0c-8439-7f40-b4cd-fab85af234a8';
  const nested = '019e7f0c-84fc-7d12-9306-2d528c4dff74';
  const other = '019e7f0c-85e3-7c31-a322-82cd2150007a';
  const timestamp = new Date().toISOString();
  const today = new Date();
  const dateDirectory = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('/');
  const write = async (id: string, meta: object, archived = false) => {
    const directory = path.join(codexRoot, archived ? 'archived_sessions' : `sessions/${dateDirectory}`);
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, `rollout-${timestamp.slice(0, 19).replaceAll(':', '-')}-${id}.jsonl`);
    await fs.writeFile(file, [
      { timestamp, type: 'session_meta', payload: {
        id, timestamp, cwd: '/tmp/pmux-native-fixture', originator: 'codex_cli_rs', cli_version: '0.162.1', model_provider: 'openai', ...meta,
      } },
      { timestamp, type: 'event_msg', payload: { type: 'user_message', message: 'fixture', images: [], local_images: [], text_elements: [] } },
      { timestamp, type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'fixture' }] } },
    ].map((entry) => JSON.stringify(entry)).join('\n') + '\n');
    await fs.appendFile(path.join(codexRoot, 'session_index.jsonl'), JSON.stringify({ id, thread_name: 'fixture', updated_at: timestamp }) + '\n');
    return file;
  };

  const native = async <T>(method: string, params: object): Promise<T> => {
    const child = spawn('codex', ['app-server', '--stdio'], { env: process.env, stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = readline.createInterface({ input: child.stdout });
    try {
      return await new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Native probe timed out')), 10_000);
        const fail = (error: Error) => { clearTimeout(timeout); reject(error); };
        child.on('error', fail);
        child.stdin.on('error', fail);
        child.on('exit', () => fail(new Error('Native probe exited')));
        const send = (value: object) => child.stdin.write(JSON.stringify(value) + '\n');
        lines.on('line', (line) => {
          const response = JSON.parse(line);
          if (response.error) { fail(new Error(response.error.message)); return; }
          if (response.id === 1) send({ id: 2, method, params });
          if (response.id === 2) { clearTimeout(timeout); resolve(response.result); }
        });
        send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'pmux-native-test', version: '1' }, capabilities: { experimentalApi: true } } });
      });
    } finally {
      lines.close();
      child.stdin.end();
      child.kill();
    }
  };

  try {
    const files = [
      await write(parent, { source: 'cli' }),
      await write(review, { source: { subagent: 'review' }, parent_thread_id: parent }),
      await write(nested, { source: { subagent: { thread_spawn: { parent_thread_id: review, depth: 2 } } }, parent_thread_id: review }, true),
    ];
    const otherFile = await write(other, { source: 'cli', forked_from_id: parent });
    for (const id of [parent, review, nested, other]) {
      await native('thread/read', { threadId: id, includeTurns: false });
    }
    const listParams = { modelProviders: [], sourceKinds: ['cli', 'subAgentReview', 'subAgentThreadSpawn'], limit: 100 };
    const before = await native<{ data: { id: string }[] }>('thread/list', listParams);
    expect(before.data.map((thread) => thread.id).sort()).toEqual([parent, review, other].sort());
    const { deleteOriginalSession } = await import('@/lib/delete-session');
    const { listCodexSessions } = await import('@/lib/codex-session-list');
    expect((await listCodexSessions({ cwd: '/tmp/pmux-native-fixture', daysBack: 1 })).sessions).toHaveLength(2);
    await deleteOriginalSession('codex', parent);
    for (const file of files) await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(otherFile)).resolves.toBeUndefined();
    expect((await listCodexSessions({ cwd: '/tmp/pmux-native-fixture', daysBack: 1 })).sessions.map((entry) => entry.sessionId)).toEqual([other]);
    const index = await fs.readFile(path.join(codexRoot, 'session_index.jsonl'), 'utf8');
    for (const id of [parent, review, nested]) {
      expect(index).not.toContain(id);
      await expect(native('thread/read', { threadId: id, includeTurns: false })).rejects.toThrow();
      await expect(native('thread/resume', { threadId: id })).rejects.toThrow();
    }
    const listed = await native<{ data: { id: string }[] }>('thread/list', listParams);
    expect(listed.data.map((thread) => thread.id)).toEqual([other]);
    // Reproduce an old orphan whose parent had been deleted before this fix.
    await write(review, { source: { subagent: 'review' }, parent_thread_id: parent });
    await deleteOriginalSession('codex', parent);
    await expect(native('thread/read', { threadId: review, includeTurns: false })).rejects.toThrow();
  } finally {
    vi.unstubAllEnvs();
    await fs.rm(mocks.home, { recursive: true, force: true });
  }
}, 30_000);
