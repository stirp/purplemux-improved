import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), fail: false, broadcast: vi.fn() }));
vi.mock('os', () => ({ default: { homedir: () => '/workflow-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => mocks.files.get(file),
  mkdir: async () => {},
  writeFile: async (file: string, content: string) => {
    if (mocks.fail) throw new Error('disk full');
    mocks.files.set(file, content);
  },
  rename: async (from: string, to: string) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
  unlink: async (file: string) => { mocks.files.delete(file); },
} }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: mocks.broadcast }));
vi.mock('@/lib/tmux', () => ({}));
vi.mock('@/lib/layout-store', () => ({}));
vi.mock('@/lib/providers/registry', () => ({ listProviders: () => [] }));
import { getWorkspaces, updateSessionWorkflow, updateActive, synchronizeSessionWorkflow, removeSessionWorkflow } from '@/lib/workspace-store';

import { addSessionHistoryEntry, getSessionHistory, removeSessionHistory } from '@/lib/session-history';
import { collectWorkSessions, aggregateWorkStatus } from '@/lib/session-workflow';
import type { ISessionHistoryEntry } from '@/types/session-history';

const makeEntry = (id: string, workspaceId = 'ws'): ISessionHistoryEntry => ({
  id, tabId: 't', workspaceId, workspaceName: workspaceId, workspaceDir: '/project',
  providerId: 'codex', agentSessionId: id, prompt: id, result: 'done', startedAt: 1,
  completedAt: Number(id.replace('s', '')) || 1, duration: 1, dismissedAt: null, toolUsage: {}, touchedFiles: [],
});
const file = '/workflow-test/.purplemux/workspaces.json';
beforeEach(() => {
  mocks.files.clear();
  mocks.fail = false;
  (globalThis as { __purplemuxSessionHistoryContentCache?: string }).__purplemuxSessionHistoryContentCache = undefined;
  vi.clearAllMocks();
  (globalThis as { __purplemuxWorkspacesContentCache?: string }).__purplemuxWorkspacesContentCache = undefined;
  mocks.files.set(file, JSON.stringify({ workspaces: [{ id: 'ws', name: 'Work', directories: ['/project'] }], groups: [],
    sidebarCollapsed: false, sidebarWidth: 240 }));
});
describe('persistent workflow preferences', () => {
  it('reads legacy workspaces and preserves unrelated fields while saving concurrent updates', async () => {
    expect((await getWorkspaces()).sessionWorkflow).toBeUndefined();
    await Promise.all([
      updateSessionWorkflow({ key: 'codex:s1', status: 'completed' }),
      updateSessionWorkflow({ key: 'claude:s1', status: 'pending' }),
      updateSessionWorkflow({ section: 'review', collapsed: true }),
      updateActive({ sidebarWidth: 300 }),
    ]);
    const data = await getWorkspaces();
    expect(data.sessionWorkflow).toEqual({
      statuses: { 'codex:s1': 'completed', 'claude:s1': 'pending' }, collapsed: { review: true },
    });
    expect(data.sidebarWidth).toBe(300);
    expect(data.workspaces[0].name).toBe('Work');
    expect(mocks.broadcast).toHaveBeenCalledWith({ type: 'workspace' });
    await updateSessionWorkflow({ key: 'codex:s1', status: null });
    expect((await getWorkspaces()).sessionWorkflow?.statuses).toEqual({ 'claude:s1': 'pending' });
  });
  it('persists first binding atomically and never transfers its manual status to session B', async () => {
    await updateSessionWorkflow({ key: 'codex:tab:t', status: 'completed' });
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'A' } });
    const first = (await getWorkspaces()).sessionWorkflow!;
    expect(first.statuses).toEqual({ 'codex:A': 'completed' });
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'B' } });
    const second = (await getWorkspaces()).sessionWorkflow!;
    expect(second.statuses['codex:B']).toBeUndefined();
    expect(collectWorkSessions([], {}, second).find((s) => s.key === 'codex:B')?.status).toBe('pending');
  });
  it('indexes history before the actual 200-turn cap and keeps completion after reload', async () => {
    const old = makeEntry('s0');
    const newer = Array.from({ length: 199 }, (_, i) => makeEntry('s' + (i + 1), 'other'));
    mocks.files.set('/workflow-test/.purplemux/session-history.json', JSON.stringify({ version: 1, entries: [...newer.reverse(), old] }));
    await updateSessionWorkflow({ key: 'codex:s0', status: 'completed' });
    await addSessionHistoryEntry(makeEntry('s200', 'other'));
    expect(await getSessionHistory()).toHaveLength(200);
    expect((await getSessionHistory()).some((entry) => entry.id === old.id)).toBe(false);
    const saved = (await getWorkspaces()).sessionWorkflow!;
    const related = collectWorkSessions(await getSessionHistory(), {}, saved).filter((s) => s.workspaceId === 'ws');
    expect(related).toHaveLength(1);
    expect(related[0].entry?.workspaceDir).toBe('/project');
    expect(aggregateWorkStatus(related.map((s) => s.status))).toBe('completed');
    await removeSessionHistory('codex', 's0');
    await removeSessionWorkflow('codex', 's0');
    await synchronizeSessionWorkflow(await getSessionHistory());
    expect((await getWorkspaces()).sessionWorkflow?.sessions?.['codex:s0']).toBeUndefined();
    expect((await getWorkspaces()).sessionWorkflow?.statuses['codex:s0']).toBeUndefined();
  });
  it('keeps saved state on write failure and releases the lock for retry', async () => {
    const before = mocks.files.get(file);
    mocks.fail = true;
    await expect(updateSessionWorkflow({ key: 'codex:s1', status: 'completed' })).rejects.toThrow('disk full');
    expect(mocks.files.get(file)).toBe(before);
    expect(mocks.broadcast).not.toHaveBeenCalled();
    mocks.fail = false;
    await updateSessionWorkflow({ section: 'completed', collapsed: true });
    expect((await getWorkspaces()).sessionWorkflow?.collapsed.completed).toBe(true);
  });
});
