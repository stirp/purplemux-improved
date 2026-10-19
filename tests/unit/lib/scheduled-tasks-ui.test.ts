// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SWRConfig, type Cache } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ScheduledTasksDialog from '@/components/features/workspace/scheduled-tasks-dialog';
import type { IScheduledTask } from '@/lib/scheduled-tasks';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
let root: Root;
let container: HTMLDivElement;
let tasks: IScheduledTask[];
let failSave: boolean;
let failLoad: boolean;
let cache: Cache;
const click = async (text: string, last = false) => {
  const buttons = Array.from(document.querySelectorAll('button')).filter((node) => node.textContent === text);
  await act(async () => (last ? buttons.at(-1)! : buttons[0]).click());
};
const fill = async (name: string, value: string) => {
  await act(async () => {
    const node = document.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(node), 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const render = async () => {
  await act(async () => root.render(createElement(SWRConfig, { value: { provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false } },
    createElement(ScheduledTasksDialog, { workspace: { id: 'ws', name: 'Workspace', directories: ['/tmp'] }, onClose: vi.fn() }))));
};
beforeEach(() => {
  cache = new Map(); failSave = false; failLoad = false;
  tasks = [{ id: 'task', workspaceId: 'ws', name: 'Example', kind: 'shell', content: 'pwd', cwd: '/tmp', enabled: true, timeoutMinutes: 30,
    schedule: { frequency: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' }, nextRunAt: '2030-01-01T01:00:00Z', runs: [] }];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (!options?.method) return { ok: !failLoad, json: async () => structuredClone(tasks) };
    if (failSave) return { ok: false, json: async () => ({ error: 'storage' }) };
    const body = JSON.parse(String(options.body));
    if (options.method === 'POST') tasks.push({ ...body, id: 'new', workspaceId: 'ws', runs: [], nextRunAt: null });
    if (options.method === 'PUT') tasks = tasks.map((task) => task.id === body.id ? { ...task, ...body.task } : task);
    if (options.method === 'DELETE') tasks = tasks.filter((task) => task.id !== body.id);
    if (options.method === 'PATCH' && body.action !== 'run') tasks[0].enabled = body.action === 'enable';
    return { ok: true, json: async () => tasks };
  }));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('scheduled task UI', () => {
  it('preserves edits on save failure and saves only after retry', async () => {
    await render(); await click('edit'); await fill('name', 'New name'); await fill('content', 'printf done');
    failSave = true; await click('save');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('errors.storage');
    expect((document.querySelector('[name="name"]') as HTMLInputElement).value).toBe('New name');
    expect(tasks[0].name).toBe('Example');
    failSave = false; await click('save');
    expect(tasks[0].name).toBe('New name'); expect(document.querySelector('form')).toBeNull();
  });
  it.each(['shell', 'claude', 'codex'])('creates %s tasks with a weekly schedule and explicit zone', async (kind) => {
    await render(); await click('add');
    await fill('name', 'Weekly'); await fill('kind', kind); await fill('content', 'Do the task');
    await fill('frequency', 'weekly'); await fill('weekday', '5'); await fill('timeZone', 'Europe/London');
    await click('save');
    expect(tasks[1]).toMatchObject({ kind, content: 'Do the task', schedule: { frequency: 'weekly', weekday: 5, timeZone: 'Europe/London', time: '09:00' } });
    expect(vi.mocked(fetch).mock.calls.some(([, opts]) => opts?.method === 'PATCH')).toBe(false);
  });
  it('requires explicit deletion and never runs on reading or cancelling', async () => {
    await render(); await click('delete'); expect(tasks).toHaveLength(1);
    await click('cancel'); expect(tasks).toHaveLength(1);
    await click('delete'); await click('delete', true); expect(tasks).toHaveLength(0);
    expect(vi.mocked(fetch).mock.calls.some(([, opts]) => opts?.method === 'PATCH')).toBe(false);
  });
  it('shows load failures and retries instead of showing an empty list', async () => {
    failLoad = true; await render();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('errors.storage');
    expect(document.body.textContent).not.toContain('empty');
    failLoad = false; await click('retry');
    expect(document.body.textContent).toContain('Example');
  });
  it('shows logs as text, disables conflicting changes and keeps pause available', async () => {
    tasks[0].runs = [{ id: 'run', trigger: 'manual', startedAt: '2030-01-01T00:00:00Z', status: 'running', output: '<img src=x onerror=alert(1)>' }];
    await render();
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const label of ['edit', 'delete', 'statuses.running']) expect(buttons.find((node) => node.textContent === label)?.disabled).toBe(true);
    expect(buttons.find((node) => node.textContent === 'pause')?.disabled).toBe(false);
    expect(document.querySelector('pre')?.textContent).toContain('<img'); expect(document.querySelector('img')).toBeNull();
  });
});
