import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(), native: vi.fn(), broadcast: vi.fn(), workspaceBroadcast: vi.fn(),
}));
vi.mock('os', () => ({ default: { homedir: () => '/cascade-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => {
    if (!mocks.files.has(file)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
    return mocks.files.get(file)!;
  },
  mkdir: async () => {},
  writeFile: async (file: string, content: string) => { mocks.files.set(file, content); },
  rename: async (from: string, to: string) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
  unlink: async (file: string) => { mocks.files.delete(file); },
} }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: mocks.workspaceBroadcast }));
vi.mock('@/lib/tmux', () => ({}));
vi.mock('@/lib/layout-store', () => ({}));
vi.mock('@/lib/providers/registry', () => ({ listProviders: () => [] }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => ({}), broadcast: mocks.broadcast }) }));
vi.mock('@/lib/delete-codex-session', () => ({ deleteCodexSession: mocks.native }));
vi.mock('@/lib/codex-session-family', () => ({ collectCodexSessionFamily: async () => ['review', 'sibling', 'parent'] }));
vi.mock('@/lib/codex-session-list', () => ({ clearCodexSessionListCache: vi.fn() }));

import handler from '@/pages/api/session-history';
import { getWorkspaces, synchronizeSessionWorkflow, updateSessionWorkflow } from '@/lib/workspace-store';
import { getSessionHistory } from '@/lib/session-history';
import { readHiddenSessions } from '@/lib/hidden-sessions';
import { collectWorkSessions, aggregateWorkStatus } from '@/lib/session-workflow';
import type { ISessionHistoryEntry } from '@/types/session-history';

const entry = (id: string, sessionId = id, providerId: 'claude' | 'codex' = 'codex'): ISessionHistoryEntry => ({
  id, agentSessionId: sessionId, providerId, tabId: `tab-${sessionId}`, workspaceId: 'ws', workspaceName: 'Project',
  workspaceDir: '/project', prompt: 'prompt', result: 'done', startedAt: 1, completedAt: 2, duration: 1,
  dismissedAt: null, toolUsage: {}, touchedFiles: [],
});
const initialHistory = [entry('parent'), entry('review-turn-1', 'review'), entry('review-turn-2', 'review'),
  entry('sibling'), entry('other'), entry('same-id-claude', 'review', 'claude')];

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.native.mockReset().mockResolvedValue(undefined);
  mocks.files.clear();
  const shared = globalThis as { __purplemuxSessionHistoryContentCache?: string; __purplemuxWorkspacesContentCache?: string };
  shared.__purplemuxSessionHistoryContentCache = undefined;
  shared.__purplemuxWorkspacesContentCache = undefined;
  mocks.files.set('/cascade-test/.purplemux/workspaces.json', JSON.stringify({
    workspaces: [{ id: 'ws', name: 'Project', directories: ['/project'] }], groups: [], sidebarCollapsed: false, sidebarWidth: 240,
  }));
  mocks.files.set('/cascade-test/.purplemux/session-history.json', JSON.stringify({ version: 1, entries: initialHistory }));
  await synchronizeSessionWorkflow(initialHistory);
  for (const id of ['parent', 'review', 'sibling', 'other']) {
    await updateSessionWorkflow({ key: `codex:${id}`, status: id === 'review' ? 'in-progress' : 'completed' });
    await updateSessionWorkflow({ key: `codex:${id}`, title: id });
  }
  await updateSessionWorkflow({ key: 'claude:review', status: 'completed' });
  mocks.broadcast.mockClear();
  mocks.workspaceBroadcast.mockClear();
});

const remove = async (deleteOriginal = true) => {
  const res = { status: vi.fn(), json: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method: 'DELETE', body: { provider: 'codex', sessionId: 'parent', deleteOriginal } } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};

const assertDeleted = async (ids: string[]) => {
  const hidden = await readHiddenSessions();
  const workflow = (await getWorkspaces()).sessionWorkflow!;
  const history = await getSessionHistory();
  for (const id of ids) {
    expect(hidden.has(`codex:${id}`)).toBe(true);
    expect(workflow.deleted).toContain(`codex:${id}`);
    expect(workflow.sessions?.[`codex:${id}`]).toBeUndefined();
    expect(workflow.statuses[`codex:${id}`]).toBeUndefined();
    expect(workflow.titles?.[`codex:${id}`]).toBeUndefined();
    expect(history.some((item) => item.providerId === 'codex' && item.agentSessionId === id)).toBe(false);
  }
};

describe('cascade deletion with application history and workflow storage', () => {
  it('removes recovered descendants and all their rounds, states and titles, while preserving other identities', async () => {
    const before = collectWorkSessions(initialHistory, {}, (await getWorkspaces()).sessionWorkflow!);
    expect(aggregateWorkStatus(before.map((item) => item.status))).toBe('in-progress');
    expect((await remove()).status).toHaveBeenCalledWith(204);
    await assertDeleted(['review', 'sibling', 'parent']);
    expect((await getSessionHistory()).map((item) => item.id)).toEqual(['other', 'same-id-claude']);
    expect(mocks.broadcast).toHaveBeenCalledTimes(3);
    expect(mocks.broadcast).toHaveBeenLastCalledWith({ type: 'session-history:sync', entries: await getSessionHistory() });
    // A delayed full history snapshot and an inactive restored Tab cannot revive the review.
    const tabs = { restored: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'review', cliState: 'inactive' as const } };
    await synchronizeSessionWorkflow(initialHistory, tabs);
    const sessions = collectWorkSessions(initialHistory, tabs, (await getWorkspaces()).sessionWorkflow!);
    expect(sessions.map((item) => item.key).sort()).toEqual(['claude:review', 'codex:other']);
    expect(aggregateWorkStatus(sessions.map((item) => item.status))).toBe('completed');
  });

  it.each(['sibling', 'parent'])('persists and broadcasts successful deletions when %s native deletion fails', async (failedId) => {
    mocks.native.mockImplementation(async (id: string) => { if (id === failedId) throw new Error('native refused'); });
    expect((await remove()).status).toHaveBeenCalledWith(500);
    const deleted = failedId === 'sibling' ? ['review'] : ['review', 'sibling'];
    await assertDeleted(deleted);
    expect((await readHiddenSessions()).has(`codex:${failedId}`)).toBe(false);
    const workflow = (await getWorkspaces()).sessionWorkflow!;
    expect(workflow.sessions?.[`codex:${failedId}`]).toBeDefined();
    expect(workflow.statuses[`codex:${failedId}`]).toBe('completed');
    expect(mocks.broadcast).toHaveBeenCalledTimes(deleted.length);
    expect(mocks.broadcast).toHaveBeenLastCalledWith({ type: 'session-history:sync', entries: await getSessionHistory() });
    const sessions = collectWorkSessions(await getSessionHistory(), {}, workflow);
    expect(aggregateWorkStatus(sessions.map((item) => item.status))).toBe('completed');
  });

  it('keeps descendants when the user only hides the selected parent', async () => {
    expect((await remove(false)).status).toHaveBeenCalledWith(204);
    expect(mocks.native).not.toHaveBeenCalled();
    await assertDeleted(['parent']);
    expect((await getSessionHistory()).filter((item) => item.agentSessionId === 'review' && item.providerId === 'codex')).toHaveLength(2);
    expect((await getWorkspaces()).sessionWorkflow?.sessions?.['codex:review']).toBeDefined();
  });
});
