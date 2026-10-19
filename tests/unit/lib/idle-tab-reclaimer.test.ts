import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TIdleTabTarget } from '@/lib/idle-tab-policy';
import type { ITab } from '@/types/terminal';

const m = vi.hoisted(() => ({
  policy: vi.fn(), save: vi.fn(), retain: vi.fn(), workspaces: vi.fn(), layout: vi.fn(), panes: vi.fn(),
  processes: vi.fn(), argv: vi.fn(), snapshot: vi.fn(), states: vi.fn(), pending: vi.fn(), remove: vi.fn(),
  unregister: vi.fn(), stat: vi.fn(), activity: vi.fn(), events: [] as string[], alive: true,
}));
vi.mock('fs/promises', () => ({ default: { stat: m.stat } }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaces: m.workspaces, getIdleTabPolicy: m.policy, saveIdleTabPolicy: m.save, retainReclaimedSession: m.retain }));
vi.mock('@/lib/layout-store', () => ({ collectPanes: (root: unknown) => root, readLayoutFile: m.layout, resolveLayoutFile: (id: string) => id, removeTabFromPane: m.remove }));
vi.mock('@/lib/tmux', () => ({ getAllPanesInfo: m.panes }));
vi.mock('@/lib/process-utils', () => ({ listUserProcesses: m.processes, getProcessArgv: m.argv }));
vi.mock('@/lib/local-agent-session', () => ({ classifyAgentArgv: (args: string[]) => args[0] === 'codex' || args[1]?.includes('@openai/codex') ? 'codex' : null }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: m.states, removeTab: m.unregister }) }));
vi.mock('@/lib/input-queue-server', () => ({ getInputQueue: () => ({ hasPendingInput: m.pending }) }));
vi.mock('@/lib/terminal-input-activity', () => ({ getLastTerminalInput: m.activity }));
vi.mock('@/lib/providers', () => ({ getProviderByPanelType: (type: string) => type === 'codex-cli' ? ({
  id: 'codex', readSessionId: (tab: ITab) => tab.agentState?.sessionId,
  readJsonlPath: () => '/session.jsonl', isValidSessionId: () => true,
  sessionIdFromJsonlPath: () => 'session', readRuntimeSnapshot: m.snapshot,
}) : null }));

import { previewIdleTabs, reclaimIdleTabs, idleAgentProcessChain, runIdleTabReclamation, startIdleTabReclamation, stopIdleTabReclamation } from '@/lib/idle-tab-reclaimer';

const now = Date.parse('2026-10-19T12:00:00Z');
const old = now - 7200000;
const policy = { enabled: false, idleMinutes: 60 };
const tab: ITab = { id: 'tab', name: 'Agent', order: 0, sessionName: 'terminal', panelType: 'codex-cli',
  agentState: { providerId: 'codex', sessionId: 'session', jsonlPath: '/session.jsonl', summary: null } };
const rows = [
  { pid: 1, ppid: 0, uid: 1000, startedAt: new Date(old).toISOString(), args: 'bash' },
  { pid: 2, ppid: 1, uid: 1000, startedAt: new Date(old).toISOString(), args: 'codex' },
];
const state = { cliState: 'idle', agentSessionId: 'session', workspaceId: 'ws' };
const targets = async (): Promise<TIdleTabTarget[]> => (await previewIdleTabs()).candidates.map(({ workspaceId, paneId, tabId, sessionId, lastActivityAt }) =>
  ({ workspaceId, paneId, tabId, sessionId, lastActivityAt }));

beforeEach(() => {
  vi.resetAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(now);
  m.alive = true; m.events = [];
  m.policy.mockResolvedValue({ ...policy });
  m.workspaces.mockResolvedValue({ workspaces: [{ id: 'ws', name: 'Work', directories: ['/first', '/original'] }] });
  m.layout.mockResolvedValue({ root: [{ id: 'pane', tabs: [tab] }] });
  m.states.mockReturnValue({ tab: { ...state } });
  m.processes.mockImplementation(async () => m.alive ? rows : []);
  m.argv.mockImplementation(async (process) => [process.args]);
  m.panes.mockImplementation(async () => new Map(m.alive ? [['terminal', { pid: 1, path: '/original' }]] : []));
  m.snapshot.mockResolvedValue({ idle: true, stale: false, lastEntryTs: old });
  m.stat.mockResolvedValue({ isFile: () => true, isDirectory: () => true, size: 10, mtimeMs: old });
  m.activity.mockReturnValue(0); m.pending.mockReturnValue(false);
  m.retain.mockImplementation(async () => { m.events.push('retain'); });
  m.remove.mockImplementation(async (_ws, _pane, _tab, guard) => {
    await guard.beforeClose(tab);
    m.events.push('stop'); m.alive = false;
    await guard.afterClose(); m.events.push('remove');
    return true;
  });
});
afterEach(() => { stopIdleTabReclamation(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe('idle agent tab reclamation', () => {
  it('previews safe tabs and retains the original directory before stopping', async () => {
    const selected = await targets();
    expect(selected).toHaveLength(1);
    expect(await reclaimIdleTabs(selected, policy)).toMatchObject({ reclaimed: selected, skipped: [] });
    expect(m.events).toEqual(['retain', 'stop', 'remove']);
    expect(m.retain).toHaveBeenCalledWith('tab', expect.objectContaining({ workspaceDir: '/original', agentSessionId: 'session' }));
    expect(m.unregister).toHaveBeenCalledWith('tab');
  });
  it.each(['busy', 'needs-input', 'unknown', 'inactive'])('protects %s state', async (cliState) => {
    m.states.mockReturnValue({ tab: { ...state, cliState } });
    expect(await targets()).toEqual([]);
  });
  it.each(['compactingSince', 'permissionRequest'])('protects %s', async (field) => {
    m.states.mockReturnValue({ tab: { ...state, [field]: 1 } });
    expect(await targets()).toEqual([]);
  });
  it('protects pending input, stale snapshots, missing records and new launches', async () => {
    m.pending.mockReturnValue(true); expect(await targets()).toEqual([]);
    m.pending.mockReturnValue(false); m.snapshot.mockResolvedValue({ idle: true, stale: true, lastEntryTs: old });
    expect(await targets()).toEqual([]);
    m.snapshot.mockResolvedValue({ idle: true, stale: false, lastEntryTs: old });
    m.stat.mockRejectedValueOnce(new Error('missing')); expect(await targets()).toEqual([]);
    m.processes.mockResolvedValue([rows[0], { ...rows[1], startedAt: new Date(now).toISOString() }]);
    expect(await targets()).toEqual([]);
  });
  it('rejects background tools, native subagents and multiple panes', async () => {
    m.processes.mockResolvedValue([...rows, { ...rows[1], pid: 3, ppid: 2 }]);
    expect(await targets()).toEqual([]);
    m.processes.mockResolvedValue([...rows, { ...rows[1], pid: 3, ppid: 1, args: 'sleep' }]);
    expect(await targets()).toEqual([]);
    m.processes.mockResolvedValue(rows);
    m.panes.mockResolvedValue(new Map([['terminal', { pid: 1, path: '/original' }], ['terminal:3', { pid: 3, path: '/original' }]]));
    expect(await targets()).toEqual([]);
  });
  it('allows known Node launchers but rejects arbitrary wrappers', async () => {
    const wrapped = [rows[0], { ...rows[1], args: 'node' }, { ...rows[1], pid: 3, ppid: 2 }];
    m.argv.mockImplementation(async (p) => p.pid === 2 ? ['node', '/@openai/codex/bin/codex.js'] : [p.args]);
    expect(await idleAgentProcessChain(1, wrapped, 'codex')).toHaveLength(3);
    m.argv.mockImplementation(async (p) => [p.args]);
    expect(await idleAgentProcessChain(1, wrapped, 'codex')).toBeNull();
  });
  it('never stops after persistence failure or activity changing during persistence', async () => {
    const selected = await targets();
    m.retain.mockRejectedValueOnce(new Error('disk full'));
    expect((await reclaimIdleTabs(selected, policy)).skipped[0].reason).toBe('disk full');
    expect(m.remove).not.toHaveBeenCalled();
    m.retain.mockImplementationOnce(async () => { m.activity.mockReturnValue(now); });
    expect((await reclaimIdleTabs(selected, policy)).reclaimed).toEqual([]);
    expect(m.events).not.toContain('stop');
  });
  it('invalidates old previews when policy or native identity changes', async () => {
    const selected = await targets();
    m.policy.mockResolvedValue({ ...policy, idleMinutes: 30 });
    expect((await reclaimIdleTabs(selected, policy)).reclaimed).toEqual([]);
    m.policy.mockResolvedValue(policy); m.states.mockReturnValue({ tab: { ...state, agentSessionId: 'new' } });
    expect((await reclaimIdleTabs(selected, policy)).reclaimed).toEqual([]);
    expect(m.remove).not.toHaveBeenCalled();
  });
  it('keeps the tab when a process survives closing', async () => {
    const selected = await targets();
    m.processes.mockResolvedValue(rows);
    const result = await reclaimIdleTabs(selected, policy);
    expect(result.reclaimed).toEqual([]);
    expect(result.skipped[0].reason).toContain('not stopped');
    expect(m.events).not.toContain('remove');
    expect(m.unregister).not.toHaveBeenCalled();
  });
  it('serializes duplicate requests so only one stops the terminal', async () => {
    const selected = await targets();
    const results = await Promise.all([reclaimIdleTabs(selected, policy), reclaimIdleTabs(selected, policy)]);
    expect(results.flatMap((result) => result.reclaimed)).toHaveLength(1);
    expect(m.events.filter((event) => event === 'stop')).toHaveLength(1);
  });
  it('does no process scan while automatic reclamation is disabled', async () => {
    await runIdleTabReclamation();
    expect(m.processes).not.toHaveBeenCalled();
  });
  it('runs automatically once per minute and stops its singleton timer', async () => {
    vi.useFakeTimers({ now });
    m.policy.mockResolvedValue({ ...policy, enabled: true });
    startIdleTabReclamation(); startIdleTabReclamation();
    await vi.advanceTimersByTimeAsync(60000);
    expect(m.events).toEqual(['retain', 'stop', 'remove']);
    stopIdleTabReclamation();
    const calls = m.policy.mock.calls.length;
    await vi.advanceTimersByTimeAsync(120000);
    expect(m.policy).toHaveBeenCalledTimes(calls);
  });
});
