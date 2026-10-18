import fs from 'node:fs/promises';
import path from 'node:path';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { ITab } from '@/types/terminal';

const mocks = vi.hoisted(() => ({
  home: '', exec: vi.fn(), register: vi.fn(), launch: vi.fn(), resume: vi.fn(), bind: vi.fn(),
}));
vi.mock('os', () => ({ default: { homedir: () => mocks.home } }));
vi.mock('child_process', () => ({ execFile: mocks.exec }));
vi.mock('@/lib/pristine-env', () => ({ PRISTINE_ENV: { HOME: '/tmp', SHELL: '/bin/bash' } }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getActiveWorkspaceId: vi.fn(), updateWorkspaceDirectories: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ registerTab: mocks.register, markAgentLaunch: mocks.launch }) }));
vi.mock('@/lib/agent-availability', () => ({
  checkAgentAvailabilityForPanelType: async () => ({ ok: true }), toAgentAvailabilityError: vi.fn(),
}));
vi.mock('@/lib/providers', () => ({ getProviderByPanelType: () => ({
  id: 'codex', panelType: 'codex-cli', isValidSessionId: () => true,
  writeSessionId: mocks.bind, readSessionId: () => null, buildResumeCommand: mocks.resume,
  writeSummary: vi.fn(), readJsonlPath: () => null, sessionIdFromJsonlPath: () => null, writeJsonlPath: vi.fn(),
}) }));

let handler: typeof import('@/pages/api/layout/pane/[paneId]/tabs')['default'];
let layoutPath: string;
let projectDir: string;

const call = async (body: Record<string, unknown>, paneId = 'pane-test') => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method: 'POST', query: { workspace: 'ws-test', paneId }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return { res, tab: res.json.mock.calls[0]?.[0] as ITab };
};
const commands = () => mocks.exec.mock.calls.map((call) => call[1] as string[]);

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.home = await fs.mkdtemp('/tmp/purplemux-tab-cwd-');
  projectDir = path.join(mocks.home, 'project');
  await fs.mkdir(projectDir);
  layoutPath = path.join(mocks.home, '.purplemux/workspaces/ws-test/layout.json');
  await fs.mkdir(path.dirname(layoutPath), { recursive: true });
  await fs.writeFile(layoutPath, JSON.stringify({
    root: { type: 'pane', id: 'pane-test', tabs: [], activeTabId: null },
    activePaneId: 'pane-test', updatedAt: '2026-10-18T00:00:00Z',
  }));
  mocks.exec.mockImplementation((_file, _args, options, callback) => {
    const check = options.cwd ? fs.stat(options.cwd) : Promise.resolve();
    void check.then(() => callback(null, '', ''), (error) => callback(error, '', ''));
    return {};
  });
  mocks.resume.mockResolvedValue('codex resume test-session');
  handler = (await import('@/pages/api/layout/pane/[paneId]/tabs')).default;
});

afterEach(() => vi.useRealTimers());

describe('tab creation working directory', () => {
  it.each(['missing', 'missing/nested', 'worktree (deleted)'])('recovers %s and persists the actual directory', async (suffix) => {
    const { res, tab } = await call({ cwd: path.join(projectDir, suffix) });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(tab.cwd).toBe(projectDir);
    expect(commands()[0]).toContain(projectDir);
    expect(mocks.exec.mock.calls[0][2].cwd).toBe('/');
    const saved = JSON.parse(await fs.readFile(layoutPath, 'utf8'));
    expect(saved.root.tabs).toEqual([tab]);
    expect(saved.root.activeTabId).toBe(tab.id);
  });

  it('preserves an existing directory even when its name ends in (deleted)', async () => {
    const cwd = path.join(projectDir, 'real (deleted)');
    await fs.mkdir(cwd);
    const { res, tab } = await call({ cwd, command: 'echo ready' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(tab.cwd).toBe(cwd);
    expect(commands().some((args) => args.includes('echo ready'))).toBe(true);
    expect(mocks.launch).toHaveBeenCalledWith(tab.id);
  });

  it('keeps the HOME default when cwd is omitted', async () => {
    const { res, tab } = await call({});
    expect(res.status).toHaveBeenCalledWith(200);
    expect(tab.cwd).toBeUndefined();
    expect(commands()[0]).toContain('/tmp');
    expect(mocks.exec.mock.calls[0][2].cwd).toBe('/');
  });

  it.each([{ command: 'echo must-not-run' }, { resumeSessionId: 'test-session', panelType: 'codex-cli' }])('does not auto-launch after fallback: %j', async (launch) => {
    vi.useFakeTimers();
    const { res } = await call({ cwd: path.join(projectDir, 'missing'), ...launch });
    expect(res.status).toHaveBeenCalledWith(200);
    await vi.runAllTimersAsync();
    expect(commands().some((args) => args.includes('send-keys'))).toBe(false);
    expect(mocks.resume).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('preserves automatic resume in a valid directory', async () => {
    vi.useFakeTimers();
    const { res, tab } = await call({ cwd: projectDir, resumeSessionId: 'test-session', panelType: 'codex-cli' });
    expect(res.status).toHaveBeenCalledWith(200);
    await vi.runAllTimersAsync();
    expect(mocks.bind).toHaveBeenCalled();
    expect(mocks.resume).toHaveBeenCalled();
    expect(commands().some((args) => args.includes('codex resume test-session'))).toBe(true);
    expect(mocks.launch).toHaveBeenCalledWith(tab.id);
  });

  it('does not create a terminal for browser tabs', async () => {
    const cwd = path.join(projectDir, 'missing');
    const { res, tab } = await call({ cwd, panelType: 'web-browser' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(tab.cwd).toBe(cwd);
    expect(mocks.exec).not.toHaveBeenCalled();
  });

  it('does not create a terminal for a missing pane', async () => {
    const { res } = await call({ cwd: projectDir }, 'pane-missing');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mocks.exec).not.toHaveBeenCalled();
  });

  it('preserves the layout if tmux itself cannot start', async () => {
    const before = await fs.readFile(layoutPath, 'utf8');
    mocks.exec.mockImplementation((_file, _args, _options, callback) => {
      queueMicrotask(() => callback(Object.assign(new Error('spawn tmux ENOENT'), { code: 'ENOENT' }), '', ''));
      return {};
    });
    const { res } = await call({ cwd: projectDir });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(await fs.readFile(layoutPath, 'utf8')).toBe(before);
    expect(mocks.register).not.toHaveBeenCalled();
  });
});
