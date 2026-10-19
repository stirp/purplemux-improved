import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_SCHEDULED_TASKS, type IScheduledTask, type TScheduledTaskInput } from '@/lib/scheduled-tasks';
import type { TTaskExecution } from '@/lib/scheduled-task-runner';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), fail: false, readFail: false, directory: true, failedWrites: 0 }));
vi.mock('os', () => ({ default: { homedir: () => '/scheduled-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => {
    if (mocks.readFail) throw new Error('read failed');
    if (!mocks.files.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return mocks.files.get(file);
  },
  stat: async () => ({ isDirectory: () => mocks.directory }),
  writeFile: async (file: string, content: string) => { if (mocks.fail) { mocks.failedWrites++; throw new Error('disk full'); } mocks.files.set(file, content); },
  rename: async (from: string, to: string) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
  unlink: async (file: string) => mocks.files.delete(file),
} }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/tmux', () => ({}));
vi.mock('@/lib/layout-store', () => ({}));
vi.mock('@/lib/providers/registry', () => ({ listProviders: () => [] }));
vi.mock('@/lib/config-store', () => ({ getAgentEnvironment: vi.fn() }));
vi.mock('@/lib/preflight', () => ({ getShellPath: vi.fn() }));
vi.mock('@/lib/shell-env', () => ({ buildShellEnv: vi.fn(), defaultShell: vi.fn() }));
import { readScheduledTasks, mutateScheduledTasks, updateActive } from '@/lib/workspace-store';
import { saveScheduledTask, changeScheduledTask, listScheduledTasks } from '@/lib/scheduled-task-service';
import { ScheduledTaskScheduler } from '@/lib/scheduled-task-scheduler';
import scheduledTasksHandler from '@/pages/api/scheduled-tasks';

const file = '/scheduled-test/.purplemux/workspaces.json';
const value: TScheduledTaskInput = { name: 'test', kind: 'shell', cwd: '/tmp', content: 'pwd', timeoutMinutes: 30, enabled: true,
  schedule: { frequency: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' } };
const execute = vi.fn<(_: IScheduledTask, signal: AbortSignal) => Promise<TTaskExecution>>();
let scheduler: ScheduledTaskScheduler;
const create = async (changes: Partial<TScheduledTaskInput> = {}) => (await saveScheduledTask('ws', { ...value, ...changes })).at(-1)!;
const getTasks = async (workspaceId: string) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
  await scheduledTasksHandler({ method: 'GET', query: { workspaceId } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime('2026-10-19T00:59:50Z'); vi.clearAllMocks();
  mocks.files.clear(); mocks.fail = false; mocks.readFail = false; mocks.directory = true; mocks.failedWrites = 0;
  (globalThis as { __purplemuxWorkspacesContentCache?: string }).__purplemuxWorkspacesContentCache = undefined;
  mocks.files.set(file, JSON.stringify({ workspaces: [{ id: 'ws', name: 'test', directories: ['/tmp'] }], groups: [], sidebarWidth: 240, sidebarCollapsed: false }));
  execute.mockResolvedValue({ status: 'succeeded', output: 'ok', exitCode: 0 });
  scheduler = new ScheduledTaskScheduler(execute);
});
afterEach(async () => { mocks.fail = false; mocks.readFail = false; await scheduler.stop(); vi.useRealTimers(); });

describe('scheduled task persistence and lifecycle', () => {
  it('returns an empty list for an existing workspace in old storage without writing', async () => {
    const before = mocks.files.get(file);
    mocks.fail = true;
    const response = await getTasks('ws');
    expect(response.status).toHaveBeenLastCalledWith(200);
    expect(response.json).toHaveBeenCalledWith([]);
    expect(mocks.failedWrites).toBe(0);
    expect(mocks.files.get(file)).toBe(before);
  });
  it.each(['unknown', 'deleted', 'deleted-running'])('returns notFound for %s workspaces without changing storage', async (scenario) => {
    const task = await create();
    const data = JSON.parse(mocks.files.get(file)!);
    if (scenario !== 'unknown') {
      data.workspaces = [];
      data.scheduledTasks = scenario === 'deleted' ? [] : [{ ...task, runs: [{ id: 'run', status: 'running', trigger: 'manual', startedAt: new Date().toISOString(), output: '' }] }];
      mocks.files.set(file, JSON.stringify(data));
    }
    const workspaceId = scenario === 'unknown' ? 'missing' : 'ws';
    const before = mocks.files.get(file);
    await expect(listScheduledTasks(workspaceId)).rejects.toMatchObject({ status: 404, code: 'notFound' });
    const response = await getTasks(workspaceId);
    expect(response.status).toHaveBeenLastCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ error: 'notFound' });
    expect(mocks.files.get(file)).toBe(before);
  });
  it.each(['read', 'json'])('preserves storage errors on GET: %s', async (failure) => {
    if (failure === 'read') mocks.readFail = true;
    else mocks.files.set(file, '{');
    const response = await getTasks('ws');
    expect(response.status).toHaveBeenLastCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ error: 'storage' });
  });
  it('cleans legacy orphan tasks before checking the creation limit, preserving other workspaces', async () => {
    const task = await create();
    const data = JSON.parse(mocks.files.get(file)!);
    data.scheduledTasks = Array.from({ length: MAX_SCHEDULED_TASKS }, (_, i) => ({ ...task, id: `orphan-${i}`, workspaceId: 'deleted' }));
    mocks.files.set(file, JSON.stringify(data));
    await Promise.all([create({ name: 'new one' }), create({ name: 'new two' }), updateActive({ sidebarWidth: 333 })]);
    expect((await readScheduledTasks()).map((task) => task.name)).toEqual(['new one', 'new two']);
    expect(JSON.parse(mocks.files.get(file)!).sidebarWidth).toBe(333);
    await mutateScheduledTasks((tasks) => {
      const template = tasks[0];
      while (tasks.length < MAX_SCHEDULED_TASKS) tasks.push({ ...template, id: `valid-${tasks.length}` });
    });
    await expect(create()).rejects.toMatchObject({ code: 'limit' });
    expect(await readScheduledTasks()).toHaveLength(MAX_SCHEDULED_TASKS);
  });

  it('can create and re-enable a weekly task before its missing DST week', async () => {
    vi.setSystemTime('2026-03-01T07:30:00Z');
    const task = await create({ schedule: { frequency: 'weekly', weekday: 0, time: '02:30', timeZone: 'America/New_York' } });
    expect(task.nextRunAt).toBe('2026-03-15T06:30:00.000Z');
    await changeScheduledTask('ws', task.id, 'pause');
    await changeScheduledTask('ws', task.id, 'enable');
    expect((await readScheduledTasks())[0]).toMatchObject({ enabled: true, nextRunAt: '2026-03-15T06:30:00.000Z' });
  });
  it('supports old files and concurrent creates without overwriting workspace changes', async () => {
    expect(await readScheduledTasks()).toEqual([]);
    await mutateScheduledTasks((_, workspaces) => { workspaces.push({ id: 'other', name: 'Other', directories: ['/tmp'] }); });
    await Promise.all([create(), create({ kind: 'codex' }), create({ kind: 'claude' }), updateActive({ sidebarWidth: 333 })]);
    expect(await listScheduledTasks('ws')).toHaveLength(3);
    expect(await listScheduledTasks('other')).toEqual([]);
    const response = await getTasks('ws');
    expect(response.status).toHaveBeenLastCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(await listScheduledTasks('ws'));
    expect(JSON.parse(mocks.files.get(file)!).sidebarWidth).toBe(333);
  });
  it('validates directories, ownership and one-time dates without corrupting data', async () => {
    const task = await create();
    await expect(saveScheduledTask('other', value, task.id)).rejects.toMatchObject({ status: 404 });
    await expect(changeScheduledTask('other', task.id, 'delete')).rejects.toMatchObject({ status: 404 });
    await expect(create({ cwd: 'relative' })).rejects.toMatchObject({ code: 'directory' });
    mocks.directory = false;
    await expect(create()).rejects.toMatchObject({ code: 'directory' });
    mocks.directory = true;
    await expect(create({ schedule: { frequency: 'once', at: '2020-01-01T00:00:00Z' } })).rejects.toMatchObject({ code: 'past' });
    await changeScheduledTask('ws', task.id, 'pause');
    expect((await readScheduledTasks())[0]).toMatchObject({ enabled: false, nextRunAt: null });
    await changeScheduledTask('ws', task.id, 'enable');
    await saveScheduledTask('ws', { ...value, name: 'edited' }, task.id);
    expect((await readScheduledTasks())[0].name).toBe('edited');
    await changeScheduledTask('ws', task.id, 'delete');
    expect(await readScheduledTasks()).toEqual([]);
  });
  it('fails closed on failed writes, read errors and corrupt JSON', async () => {
    const before = mocks.files.get(file);
    mocks.fail = true;
    await expect(create()).rejects.toThrow('disk full');
    expect(mocks.files.get(file)).toBe(before);
    mocks.fail = false; mocks.readFail = true;
    await expect(readScheduledTasks()).rejects.toThrow('read failed');
    mocks.readFail = false; mocks.files.set(file, '{');
    await expect(create()).rejects.toThrow();
    expect(mocks.files.get(file)).toBe('{');
  });
});

describe('scheduler claims', () => {
  it('advances an executed weekly task across a missing DST week without disabling it', async () => {
    vi.setSystemTime('2026-03-01T07:29:50Z');
    await create({ schedule: { frequency: 'weekly', weekday: 0, time: '02:30', timeZone: 'America/New_York' } });
    await scheduler.start(); vi.setSystemTime('2026-03-01T07:30:01Z');
    await scheduler.tick(); await scheduler.stop();
    expect((await readScheduledTasks())[0]).toMatchObject({ enabled: true, nextRunAt: '2026-03-15T06:30:00.000Z', runs: [{ status: 'succeeded' }] });
  });

  it('retries completed results on later ticks without rerunning or changing their finish time', async () => {
    const task = await create({ enabled: false }); await scheduler.start();
    const finishedAt = new Date().toISOString();
    execute.mockImplementation(async () => { mocks.fail = true; return { status: 'failed', output: 'original output', exitCode: 7, reason: 'exit: 7', truncated: true }; });
    await scheduler.runNow('ws', task.id);
    await vi.waitFor(() => expect(mocks.failedWrites).toBe(1));
    await expect(scheduler.tick()).rejects.toThrow('disk full');
    expect((await readScheduledTasks())[0].runs[0].status).toBe('running');
    mocks.fail = false;
    await vi.advanceTimersByTimeAsync(15000);
    const saved = (await readScheduledTasks())[0].runs[0];
    expect(saved).toMatchObject({ status: 'failed', output: 'original output', exitCode: 7, reason: 'exit: 7', truncated: true, finishedAt });
    expect(execute).toHaveBeenCalledTimes(1);
    await saveScheduledTask('ws', { ...value, name: 'editable again', enabled: false }, task.id);
    await changeScheduledTask('ws', task.id, 'delete');
    expect(await readScheduledTasks()).toEqual([]);
  });

  it('flushes four pending results before manual claims and never overwrites a later run', async () => {
    const finishes: ((value: TTaskExecution) => void)[] = [];
    execute.mockImplementation(() => new Promise((resolve) => finishes.push(resolve)));
    const tasks = [];
    for (let i = 0; i < 5; i++) tasks.push(await create({ enabled: false }));
    await scheduler.start();
    for (const task of tasks.slice(0, 4)) await scheduler.runNow('ws', task.id);
    mocks.fail = true;
    for (const finish of finishes) finish({ status: 'succeeded', output: 'original', exitCode: 0 });
    await vi.waitFor(() => expect(mocks.failedWrites).toBe(4));
    mocks.fail = false;
    execute.mockResolvedValue({ status: 'succeeded', output: 'new', exitCode: 0 });
    await Promise.all([scheduler.runNow('ws', tasks[0].id), scheduler.runNow('ws', tasks[4].id), scheduler.tick()]);
    await scheduler.stop();
    const saved = await readScheduledTasks();
    expect(saved[0].runs.map((run) => run.output)).toEqual(['new', 'original']);
    expect(saved.flatMap((task) => task.runs).every((run) => run.status === 'succeeded')).toBe(true);
    expect(execute).toHaveBeenCalledTimes(6);
  });

  it('retries pending results once more when stopping', async () => {
    const task = await create(); await scheduler.start();
    execute.mockImplementation(async () => { mocks.fail = true; return { status: 'succeeded', output: 'finished' }; });
    await scheduler.runNow('ws', task.id);
    await vi.waitFor(() => expect(mocks.failedWrites).toBe(1));
    mocks.fail = false; await scheduler.stop();
    expect((await readScheduledTasks())[0].runs[0]).toMatchObject({ status: 'succeeded', output: 'finished' });
  });

  it('retains running orphan tasks until their results are persisted, then releases capacity', async () => {
    const finishes: ((value: TTaskExecution) => void)[] = [];
    execute.mockImplementation(() => new Promise((resolve) => finishes.push(resolve)));
    const tasks = [];
    for (let i = 0; i < 4; i++) tasks.push(await create());
    await scheduler.start();
    for (const task of tasks) await scheduler.runNow('ws', task.id);
    await mutateScheduledTasks((_, workspaces) => workspaces.splice(0, 1, { id: 'replacement', name: 'Replacement', directories: ['/tmp'] }));
    const [replacement] = await saveScheduledTask('replacement', { ...value, enabled: false });
    expect((await readScheduledTasks()).filter((task) => task.workspaceId === 'ws'))
      .toEqual(tasks.map((task) => expect.objectContaining({ id: task.id, enabled: false, nextRunAt: null, runs: [expect.objectContaining({ status: 'running' })] })));
    await expect(scheduler.runNow('replacement', replacement.id)).rejects.toMatchObject({ code: 'capacity' });
    mocks.fail = true;
    for (const finish of finishes) finish({ status: 'succeeded', output: 'finished' });
    await vi.waitFor(() => expect(mocks.failedWrites).toBe(4));
    expect(await readScheduledTasks()).toHaveLength(5);
    mocks.fail = false;
    await scheduler.tick();
    expect((await readScheduledTasks()).map((task) => task.id)).toEqual([replacement.id]);
    execute.mockResolvedValue({ status: 'succeeded', output: 'replacement' });
    await scheduler.runNow('replacement', replacement.id); await scheduler.stop();
    expect(execute).toHaveBeenCalledTimes(5);
  });

  it('cleans interrupted orphan tasks on startup without executing them', async () => {
    const task = await create();
    const data = JSON.parse(mocks.files.get(file)!);
    data.scheduledTasks[0] = { ...task, workspaceId: 'deleted', runs: [{ id: 'old', status: 'running', trigger: 'manual', startedAt: new Date().toISOString(), output: '' }] };
    mocks.files.set(file, JSON.stringify(data));
    await scheduler.start();
    expect(await readScheduledTasks()).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
  it('dispatches a due one-time task once, persists its result and disables it', async () => {
    await create({ schedule: { frequency: 'once', at: '2026-10-19T01:00:00Z' } });
    await scheduler.start();
    vi.setSystemTime('2026-10-19T01:00:01Z');
    await Promise.all([scheduler.tick(), scheduler.tick()]);
    await scheduler.stop();
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await readScheduledTasks())[0]).toMatchObject({ enabled: false, nextRunAt: null, runs: [{ status: 'succeeded', output: 'ok', exitCode: 0 }] });
  });
  it('atomically excludes manual duplicates, edits and deletes while permitting pause', async () => {
    let finish!: (result: TTaskExecution) => void;
    execute.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const task = await create(); await scheduler.start();
    const results = await Promise.allSettled([scheduler.runNow('ws', task.id), scheduler.runNow('ws', task.id)]);
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(saveScheduledTask('ws', value, task.id)).rejects.toMatchObject({ code: 'running' });
    await expect(changeScheduledTask('ws', task.id, 'delete')).rejects.toMatchObject({ code: 'running' });
    await changeScheduledTask('ws', task.id, 'pause');
    finish({ status: 'succeeded', output: '' });
    await scheduler.stop();
    expect((await readScheduledTasks())[0].enabled).toBe(false);
  });
  it('does not spawn after claim persistence fails', async () => {
    const task = await create(); await scheduler.start(); mocks.fail = true;
    await expect(scheduler.runNow('ws', task.id)).rejects.toThrow('disk full');
    expect(execute).not.toHaveBeenCalled();
    expect((await readScheduledTasks())[0].runs).toEqual([]);
  });
  it('recovers interrupted runs and skips elapsed schedules without replaying', async () => {
    const task = await create({ schedule: { frequency: 'once', at: '2026-10-19T01:00:00Z' } });
    await mutateScheduledTasks((tasks) => { tasks[0].runs.push({ id: 'old', status: 'running', output: '', trigger: 'manual', startedAt: '2026-10-19T00:59:00Z' }); });
    vi.setSystemTime('2026-10-19T02:00:00Z');
    await scheduler.start(); await scheduler.tick();
    expect(execute).not.toHaveBeenCalled();
    const saved = (await readScheduledTasks())[0];
    expect(saved.runs.map((run) => run.status)).toEqual(['skipped', 'interrupted']);
    expect(saved.enabled).toBe(false);
    await expect(changeScheduledTask('ws', task.id, 'enable')).rejects.toMatchObject({ code: 'past' });
  });
  it('preserves a running record while skipping repeated overlaps', async () => {
    let finish!: (result: TTaskExecution) => void;
    execute.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const task = await create(); await scheduler.start(); await scheduler.runNow('ws', task.id);
    for (let day = 19; day <= 30; day++) {
      vi.setSystemTime(`2026-10-${day}T01:00:01Z`); await scheduler.tick();
    }
    const saved = (await readScheduledTasks())[0];
    expect(saved.runs.filter((run) => run.status === 'running')).toHaveLength(1);
    expect(saved.runs.length).toBeLessThanOrEqual(10);
    expect(execute).toHaveBeenCalledTimes(1);
    finish({ status: 'succeeded', output: 'finished' }); await scheduler.stop();
    expect((await readScheduledTasks())[0].runs.some((run) => run.output === 'finished')).toBe(true);
  });
  it('caps concurrency, skips overdue and missing workspace tasks, and leaves manual schedules intact', async () => {
    execute.mockImplementation((_, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ status: 'interrupted', output: '' }), { once: true })));
    const tasks = [];
    for (let i = 0; i < 5; i++) tasks.push(await create());
    await scheduler.start();
    for (const task of tasks.slice(0, 4)) await scheduler.runNow('ws', task.id);
    await expect(scheduler.runNow('ws', tasks[4].id)).rejects.toMatchObject({ code: 'capacity' });
    expect((await readScheduledTasks())[0].nextRunAt).toBe(tasks[0].nextRunAt);
    vi.setSystemTime('2026-10-19T01:00:01Z'); await scheduler.tick();
    expect((await readScheduledTasks())[4].runs[0].reason).toBe('capacity');
    await scheduler.stop();
    await scheduler.start();
    vi.setSystemTime('2026-10-20T01:02:00Z'); await scheduler.tick();
    expect((await readScheduledTasks())[0].runs[0].reason).toBe('offline');
    await mutateScheduledTasks((_, workspaces) => workspaces.splice(0));
    vi.setSystemTime('2026-10-21T01:00:01Z'); await scheduler.tick();
    expect(await readScheduledTasks()).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(4);
  });
});
