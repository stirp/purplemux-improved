import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ processes: vi.fn(), argv: vi.fn(), cwd: vi.fn(), panes: vi.fn(), workspaces: vi.fn(), layout: vi.fn(), resolve: vi.fn() }));
vi.mock('@/lib/process-utils', () => ({ listUserProcesses: mocks.processes, getProcessArgv: mocks.argv, getProcessCwd: mocks.cwd }));
vi.mock('@/lib/tmux', () => ({ getAllPanesInfo: mocks.panes }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaces: mocks.workspaces }));
vi.mock('@/lib/layout-store', () => ({ readLayoutFile: mocks.layout, resolveLayoutFile: (id: string) => id, collectAllTabs: (root: unknown) => root }));
vi.mock('@/lib/local-agent-session', async (original) => ({ ...await original<typeof import('@/lib/local-agent-session')>(), resolveLocalAgentSession: mocks.resolve }));
import { ancestorPids, scanLocalAgentProcesses } from '@/lib/local-agent-processes';
const row = (pid: number, ppid: number, args: string) => ({ pid, ppid, uid: 1000, args, startedAt: '2026-10-19T10:00:00.000Z' });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.workspaces.mockResolvedValue({ workspaces: [{ id: 'ws', name: 'Repo', directories: ['/repo'] }] });
  mocks.layout.mockResolvedValue({ root: [{ id: 'tab', sessionName: 'session' }] });
  mocks.panes.mockResolvedValue(new Map([['session', { pid: 10 }]]));
  mocks.cwd.mockResolvedValue('/repo');
  mocks.argv.mockImplementation(async (item) => item.args.split(' '));
  mocks.resolve.mockResolvedValue(null);
});
describe('local process discovery', () => {
  it('deduplicates Node wrappers and finds managed owners through nested shells', async () => {
    mocks.processes.mockResolvedValue([row(10, 1, 'bash'), row(11, 10, 'zsh'), row(12, 11, 'node /pkg/@openai/codex/bin/codex.js'), row(13, 12, '/vendor/codex'), row(15, 1, 'claude'), row(16, 1, 'rg codex')]);
    const result = await scanLocalAgentProcesses();
    expect(result.processes.map((item) => item.pid)).toEqual([13, 15]);
    expect(result.processes[0]).toMatchObject({ managed: true, workspaceId: 'ws' });
    expect(result.processes[1]).toMatchObject({ managed: false, workspaceId: null });
    expect(mocks.resolve).toHaveBeenCalledTimes(1);
  });
  it('does not mistake a scan failure for an empty successful list', async () => {
    mocks.processes.mockRejectedValue(new Error('permission denied'));
    await expect(scanLocalAgentProcesses()).rejects.toThrow('permission denied');
  });
  it('keeps independent agent children instead of treating a native parent as a wrapper', async () => {
    mocks.processes.mockResolvedValue([row(20, 1, 'codex'), row(21, 20, 'codex exec task')]);
    expect((await scanLocalAgentProcesses()).processes.map((item) => item.pid)).toEqual([20, 21]);
  });
  it('handles cycles and retains unfinished transfers after the source exits', async () => {
    expect(ancestorPids(10, [row(10, 11, ''), row(11, 10, '')])).toEqual([10, 11]);
    mocks.processes.mockResolvedValue([]);
    mocks.workspaces.mockResolvedValue({ workspaces: [{ id: 'ws', name: 'Repo', agentProcessTransfers: [{ pid: 15, phase: 'stopped' }, { pid: 16, phase: 'started' }] }] });
    expect((await scanLocalAgentProcesses()).transfers).toEqual([{ pid: 15, phase: 'stopped', workspaceId: 'ws', workspaceName: 'Repo' }]);
  });
});
