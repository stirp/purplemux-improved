import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { IScheduledTask } from '@/lib/scheduled-tasks';

const mocks = vi.hoisted(() => ({ bin: '', environment: vi.fn() }));
vi.mock('@/lib/preflight', () => ({ getShellPath: async () => `${mocks.bin}:${process.env.PATH}` }));
vi.mock('@/lib/config-store', () => ({ getAgentEnvironment: mocks.environment }));
vi.mock('@/lib/shell-env', () => ({ buildShellEnv: () => ({ HOME: os.homedir() }), defaultShell: () => '/bin/sh' }));
import { executeScheduledTask } from '@/lib/scheduled-task-runner';
import { TASK_SUPERVISOR_SCRIPT } from '@/lib/scheduled-task-supervisor';

let directory: string;
beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-scheduled-test-'));
  mocks.bin = directory;
  mocks.environment.mockResolvedValue({ TASK_TEST_VALUE: 'configured' });
  const script = `#!${process.execPath}\nlet input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => input += c); process.stdin.on('end', () => console.log(JSON.stringify({args:process.argv.slice(2),input,env:process.env.TASK_TEST_VALUE,cwd:process.cwd()})));\n`;
  for (const name of ['claude', 'codex']) await fs.writeFile(path.join(directory, name), script, { mode: 0o700 });
});
afterAll(async () => { await fs.rm(directory, { recursive: true, force: true }); });
const task = (changes: Partial<IScheduledTask> = {}): IScheduledTask => ({
  id: 'task', workspaceId: 'ws', name: 'test', kind: 'shell', content: 'printf ok', cwd: directory,
  enabled: false, timeoutMinutes: 1, schedule: { frequency: 'once', at: '2030-01-01T00:00:00Z' }, runs: [], nextRunAt: null, ...changes,
});

describe('scheduled processes', () => {
  it('executes a real shell in the exact directory and records stderr and exit codes', async () => {
    const result = await executeScheduledTask(task({ content: 'pwd; printf problem >&2; exit 7' }), new AbortController().signal);
    expect(result).toMatchObject({ status: 'failed', exitCode: 7 });
    expect(result.output).toContain(directory);
    expect(result.output).toContain('problem');
    expect(await executeScheduledTask(task(), new AbortController().signal)).toMatchObject({ status: 'succeeded', output: 'ok', exitCode: 0 });
  });
  it.each(['claude', 'codex'] as const)('passes %s prompts literally through stdin in a new session', async (kind) => {
    const content = '中文\n`touch no` $(echo not-a-command) "quotes"';
    const result = await executeScheduledTask(task({ kind, content }), new AbortController().signal);
    expect(result.status).toBe('succeeded');
    const output = JSON.parse(result.output);
    expect(output).toMatchObject({ input: content, env: 'configured', cwd: directory });
    expect(output.args).not.toContain(content);
    expect(output.args).not.toContain('resume');
    expect(output.args).not.toContain('--dangerously-bypass-approvals-and-sandbox');
    expect(output.args).toEqual(kind === 'claude' ? ['-p', '--permission-mode', 'dontAsk', '--output-format', 'text']
      : ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'approval_policy="never"', '-']);
  });
  it('bounds logs while retaining the end of output', async () => {
    const result = await executeScheduledTask(task({ content: "printf '%20000s' x; printf END" }), new AbortController().signal);
    expect(result.status).toBe('succeeded');
    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.output)).toBe(16384);
    expect(result.output.endsWith('END')).toBe(true);
  });
  it('kills the process group on timeout and abort', async () => {
    const result = await executeScheduledTask(task({ content: 'sleep 30 & wait', timeoutMinutes: 0.002 }), new AbortController().signal);
    expect(result.status).toBe('timed-out');
    const controller = new AbortController();
    const pending = executeScheduledTask(task({ content: 'sleep 30 & wait' }), controller.signal);
    setTimeout(() => controller.abort(), 120);
    expect((await pending).status).toBe('interrupted');
  });
  it('does not execute in fallback directories or when already aborted', async () => {
    await expect(executeScheduledTask(task({ cwd: path.join(directory, 'missing') }), new AbortController().signal)).rejects.toMatchObject({ code: 'directory' });
    const controller = new AbortController(); controller.abort();
    expect((await executeScheduledTask(task(), controller.signal)).status).toBe('interrupted');
  });
  it('cleans the task process group when the server IPC connection disappears', async () => {
    const child = spawn(process.execPath, ['-e', TASK_SUPERVISOR_SCRIPT], { cwd: directory, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    const closed = new Promise<number | null>((resolve) => child.once('exit', resolve));
    const started = new Promise<void>((resolve) => child.stdout!.once('data', () => resolve()));
    child.send({ executable: '/bin/sh', args: ['-c', 'printf started; sleep 30 & wait'] });
    child.stdin!.end();
    await started;
    child.disconnect();
    expect(await closed).toBe(1);
  });
});
