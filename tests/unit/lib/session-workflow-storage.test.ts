import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), fail: false, broadcast: vi.fn() }));
vi.mock('os', () => ({ default: { homedir: () => '/workflow-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => {
    if (!mocks.files.has(file)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
    return mocks.files.get(file)!;
  },
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
import { getWorkspaces, updateSessionWorkflow, updateSessionTags, updateActive, synchronizeSessionWorkflow, removeSessionWorkflow } from '@/lib/workspace-store';

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
  const tag = { id: 'resident', name: 'Resident', color: 'purple' as const };
  const revision = async () => (await getWorkspaces()).sessionWorkflow?.tagsRevision ?? 0;
  it('atomically creates tags and assignments, persists on reload and preserves status', async () => {
    await synchronizeSessionWorkflow([makeEntry('s1')]);
    await updateSessionWorkflow({ key: 'codex:s1', status: 'completed' });
    const saved = await updateSessionTags({ action: 'assign', revision: 0, key: 'codex:s1', tagIds: [tag.id], newTags: [tag] });
    expect(saved.tags).toEqual([tag]);
    expect((await getWorkspaces()).sessionWorkflow?.sessionTags).toEqual({ 'codex:s1': [tag.id] });
    expect(saved.statuses['codex:s1']).toBe('completed');
    expect(mocks.broadcast).toHaveBeenCalledWith({ type: 'workspace' });
    const before = mocks.files.get(file);
    mocks.fail = true;
    await expect(updateSessionTags({ action: 'assign', revision: 1, key: 'codex:s1', tagIds: ['new'], newTags: [{ ...tag, id: 'new', name: 'New' }] })).rejects.toThrow('disk full');
    expect(mocks.files.get(file)).toBe(before);
    mocks.fail = false;
    await updateSessionTags({ action: 'assign', revision: 1, key: 'codex:s1', tagIds: [], newTags: [] });
    expect((await getWorkspaces()).sessionWorkflow?.sessionTags).toEqual({});
  });
  it('rejects stale edits and serializes parallel catalog creation', async () => {
    const results = await Promise.allSettled([
      updateSessionTags({ action: 'create', revision: 0, tag }),
      updateSessionTags({ action: 'create', revision: 0, tag: { ...tag, id: 'other', name: 'Other' } }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect((await getWorkspaces()).sessionWorkflow?.tags).toEqual([tag]);
  });
  it('migrates temporary tags on binding, consumes them, and rejects a late fallback save', async () => {
    const tabs = { t: { workspaceId: 'ws', panelType: 'codex-cli' } };
    await updateSessionTags({ action: 'assign', revision: 0, key: 'codex:tab:t', tagIds: [tag.id], newTags: [tag] }, () => tabs);
    await synchronizeSessionWorkflow([], { t: { ...tabs.t, agentSessionId: 'A' } });
    expect((await getWorkspaces()).sessionWorkflow?.sessionTags).toEqual({ 'codex:A': [tag.id] });
    await expect(updateSessionTags({ action: 'assign', revision: 1, key: 'codex:tab:t', tagIds: [tag.id], newTags: [] }, () => ({ t: { ...tabs.t, agentSessionId: 'A' } }))).rejects.toMatchObject({ code: 'conflict' });
    await synchronizeSessionWorkflow([], { t: { ...tabs.t, agentSessionId: 'B' } });
    expect((await getWorkspaces()).sessionWorkflow?.sessionTags).toEqual({ 'codex:A': [tag.id] });
    await synchronizeSessionWorkflow([], {});
    expect((await getWorkspaces()).sessionWorkflow?.sessionTags).toEqual({ 'codex:A': [tag.id] });
  });
  it.each(['tagged', 'cleared', 'hidden'] as const)('consumes reused tab indices after binding (%s)', async (scenario) => {
    const tab = { workspaceId: 'ws', panelType: 'codex-cli' };
    await synchronizeSessionWorkflow([], { t: { ...tab, agentSessionId: 'A' } });
    await updateSessionTags({ action: 'assign', revision: 0, key: 'codex:A', tagIds: ['resident'], newTags: [tag] });
    await updateSessionWorkflow({ key: 'codex:A', status: 'completed' });
    await updateSessionTags({ action: 'assign', revision: await revision(), key: 'codex:tab:t', tagIds: ['new'], newTags: [{ ...tag, id: 'new', name: 'New' }] }, () => ({ t: tab }));
    expect((await getWorkspaces()).sessionWorkflow?.sessions?.['codex:tab:t']).toBeDefined();
    if (scenario === 'cleared') await updateSessionTags({ action: 'assign', revision: await revision(), key: 'codex:tab:t', tagIds: [], newTags: [] }, () => ({ t: tab }));
    if (scenario === 'hidden') mocks.files.set('/workflow-test/.purplemux/hidden-sessions.json', JSON.stringify(['codex:B']));
    else await updateSessionWorkflow({ key: 'codex:B', status: 'completed' });
    const bound = { t: { ...tab, agentSessionId: 'B' } };
    await synchronizeSessionWorkflow([], bound);
    const expectedKeys = scenario === 'hidden' ? ['codex:A'] : ['codex:A', 'codex:B'];
    for (const tabs of [bound, {}]) {
      await synchronizeSessionWorkflow([], tabs);
      const saved = (await getWorkspaces()).sessionWorkflow!;
      expect(saved.sessionTags).toEqual(scenario === 'tagged' ? { 'codex:A': ['resident'], 'codex:B': ['new'] } : { 'codex:A': ['resident'] });
      expect(Object.keys(saved.sessions!).sort()).toEqual(expectedKeys);
      const sessions = collectWorkSessions([], tabs, saved);
      expect(sessions.map((session) => session.key).sort()).toEqual(expectedKeys);
      expect(sessions.every((session) => session.navigation?.agentSessionId)).toBe(true);
      expect(aggregateWorkStatus(sessions.map((session) => session.status))).toBe('completed');
      expect(JSON.parse(mocks.files.get(file)!).sessionWorkflow.sessions).not.toHaveProperty('codex:tab:t');
    }
  });
  it('cleans removed sessions and never applies temporary tags to hidden identities', async () => {
    await updateSessionTags({ action: 'assign', revision: 0, key: 'codex:tab:t', tagIds: [tag.id], newTags: [tag] }, () => ({ t: { workspaceId: 'ws', panelType: 'codex-cli' } }));
    mocks.files.set('/workflow-test/.purplemux/hidden-sessions.json', JSON.stringify(['codex:A']));
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'A' } });
    expect((await getWorkspaces()).sessionWorkflow?.sessionTags).toEqual({});
    await expect(updateSessionTags({ action: 'assign', revision: await revision(), key: 'codex:A', tagIds: [tag.id], newTags: [] })).rejects.toMatchObject({ code: 'missing' });
    await synchronizeSessionWorkflow([makeEntry('s1')]);
    await updateSessionTags({ action: 'assign', revision: await revision(), key: 'codex:s1', tagIds: [tag.id], newTags: [] });
    await removeSessionWorkflow('codex', 's1');
    expect((await getWorkspaces()).sessionWorkflow?.sessionTags).toEqual({});
    expect((await getWorkspaces()).sessionWorkflow?.tags).toEqual([tag]);
  });
  it('deletes tag associations without deleting sessions, other tags or statuses', async () => {
    await synchronizeSessionWorkflow([makeEntry('s1'), makeEntry('s2')]);
    await updateSessionTags({ action: 'assign', revision: 0, key: 'codex:s1', tagIds: [tag.id, 'other'], newTags: [tag, { ...tag, id: 'other', name: 'Other' }] });
    await updateSessionTags({ action: 'assign', revision: 1, key: 'codex:s2', tagIds: [tag.id], newTags: [] });
    await updateSessionWorkflow({ key: 'codex:s2', status: 'completed' });
    const saved = await updateSessionTags({ action: 'delete', revision: 2, id: tag.id });
    expect(saved.sessionTags).toEqual({ 'codex:s1': ['other'] });
    expect(Object.keys(saved.sessions!)).toHaveLength(2);
    expect(saved.statuses['codex:s2']).toBe('completed');
  });
  it('persists a tab title across the first native session binding and clears it on deletion', async () => {
    await updateSessionWorkflow({ key: 'claude:tab:t', title: 'Renamed session' });
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'claude-code', agentSessionId: 'A' } });
    expect((await getWorkspaces()).sessionWorkflow?.titles).toEqual({ 'claude:A': 'Renamed session' });
    await removeSessionWorkflow('claude', 'A');
    expect((await getWorkspaces()).sessionWorkflow?.titles).toEqual({});
  });
  it('keeps session titles distinct and supports clearing a manual title', async () => {
    await updateSessionWorkflow({ key: 'codex:first', title: '  First title  ' });
    await updateSessionWorkflow({ key: 'codex:second', title: 'Second title' });
    expect((await getWorkspaces()).sessionWorkflow?.titles).toEqual({
      'codex:first': 'First title', 'codex:second': 'Second title',
    });
    await updateSessionWorkflow({ key: 'codex:first', title: '' });
    expect((await getWorkspaces()).sessionWorkflow?.titles).toEqual({ 'codex:second': 'Second title' });
  });
  it('saves the current Tab rename marker and title in one workflow update', async () => {
    const workflow = await updateSessionWorkflow({ key: 'claude:one', title: 'Renamed', tabId: 'tab-1' });
    expect(workflow.titles).toEqual({ 'claude:one': 'Renamed' });
    expect(workflow.renamedTabs).toEqual({ 'tab-1': true });
    expect((await getWorkspaces()).sessionWorkflow?.renamedTabs).toEqual({ 'tab-1': true });
  });
  it('does not persist either part of a Tab rename when the write fails', async () => {
    const before = mocks.files.get(file);
    mocks.fail = true;
    await expect(updateSessionWorkflow({ key: 'claude:one', title: 'Renamed', tabId: 'tab-1' })).rejects.toThrow('disk full');
    expect(mocks.files.get(file)).toBe(before);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });
  it('moves a new temporary title after a Tab was already bound to an older session', async () => {
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'old' } });
    await updateSessionWorkflow({ key: 'codex:old', title: 'Old title' });
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli' } });
    await updateSessionWorkflow({ key: 'codex:tab:t', title: 'New title' });
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'new' } });
    const workflow = (await getWorkspaces()).sessionWorkflow!;
    expect(workflow.titles).toEqual({ 'codex:old': 'Old title', 'codex:new': 'New title' });
    expect(workflow.tabBindings?.['codex:tab:t']).toBe('codex:new');
    await synchronizeSessionWorkflow([]);
    expect((await getWorkspaces()).sessionWorkflow?.titles).toEqual({ 'codex:old': 'Old title', 'codex:new': 'New title' });
  });
  it('consumes a temporary title without assigning it to a deleted identity', async () => {
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'claude-code', agentSessionId: 'old' } });
    await updateSessionWorkflow({ key: 'claude:tab:t', title: 'Pending title' });
    await removeSessionWorkflow('claude', 'new');
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'claude-code', agentSessionId: 'new' } });
    expect((await getWorkspaces()).sessionWorkflow?.titles).toEqual({});
  });
  it.each(['deleted', 'hidden'])('consumes fallback on first binding of a %s native identity', async (source) => {
    await updateSessionWorkflow({ key: 'codex:tab:t', status: 'completed' });
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli' } });
    if (source === 'deleted') await removeSessionWorkflow('codex', 'A');
    else mocks.files.set('/workflow-test/.purplemux/hidden-sessions.json', JSON.stringify(['codex:A']));
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'A' } });
    const bound = (await getWorkspaces()).sessionWorkflow!;
    expect(bound.statuses).toEqual({});
    expect(bound.sessions).toEqual({});
    expect(bound.tabBindings).toEqual({ 'codex:tab:t': 'codex:A' });
    await synchronizeSessionWorkflow([]);
    expect(collectWorkSessions([], {}, (await getWorkspaces()).sessionWorkflow!)).toEqual([]);
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'B' } });
    const next = (await getWorkspaces()).sessionWorkflow!;
    expect(next.statuses).toEqual({});
    expect(collectWorkSessions([], {}, next)).toMatchObject([{ key: 'codex:B', status: 'pending' }]);
  });
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
  it('rejects a pre-delete history snapshot and inactive Tab after deletion commits', async () => {
    const staleHistory = [makeEntry('A')];
    const inactiveTabs = { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'A', cliState: 'inactive' as const } };
    await synchronizeSessionWorkflow(staleHistory, inactiveTabs);
    await updateSessionWorkflow({ key: 'codex:A', status: 'completed' });
    await removeSessionWorkflow('codex', 'A');
    await Promise.all([
      synchronizeSessionWorkflow(staleHistory, inactiveTabs),
      synchronizeSessionWorkflow(staleHistory),
    ]);
    const saved = (await getWorkspaces()).sessionWorkflow!;
    expect(saved.deleted).toContain('codex:A');
    expect(saved.sessions?.['codex:A']).toBeUndefined();
    expect(saved.statuses['codex:A']).toBeUndefined();
    expect(collectWorkSessions(staleHistory, inactiveTabs, saved)).toEqual([]);
    await synchronizeSessionWorkflow([], {});
    expect((await getWorkspaces()).sessionWorkflow?.sessions?.['codex:A']).toBeUndefined();
  });
  it('keeps deletion final when backfill was queued before the delete operation', async () => {
    const stale = [makeEntry('A')];
    await Promise.all([
      synchronizeSessionWorkflow(stale),
      removeSessionWorkflow('codex', 'A'),
    ]);
    await synchronizeSessionWorkflow(stale);
    expect((await getWorkspaces()).sessionWorkflow?.sessions?.['codex:A']).toBeUndefined();
  });
  it('excludes previous hidden-sessions markers while preserving the other provider', async () => {
    mocks.files.set('/workflow-test/.purplemux/hidden-sessions.json', JSON.stringify(['codex:A']));
    await synchronizeSessionWorkflow([makeEntry('A'), { ...makeEntry('A'), id: 'claude-A', providerId: 'claude' }], {
      t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'A', cliState: 'inactive' },
    });
    const saved = (await getWorkspaces()).sessionWorkflow!;
    expect(Object.keys(saved.sessions!)).toEqual(['claude:A']);
    expect(saved.deleted).toContain('codex:A');
  });
  it('also excludes stale legacy history without a native session ID', async () => {
    const legacy = { ...makeEntry('legacy'), agentSessionId: null };
    await removeSessionWorkflow('codex', null, 'legacy');
    await synchronizeSessionWorkflow([legacy]);
    expect(collectWorkSessions([legacy], {}, (await getWorkspaces()).sessionWorkflow!)).toEqual([]);
  });
  it('archives native navigation before any turn and after Tab reuse or close', async () => {
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'A' } });
    await synchronizeSessionWorkflow([], { t: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'B' } });
    await synchronizeSessionWorkflow([], {});
    const saved = (await getWorkspaces()).sessionWorkflow!;
    const a = collectWorkSessions([], {}, saved).find((s) => s.key === 'codex:A')!;
    expect(a.entry).toBeUndefined();
    expect(a.navigation).toEqual({
      providerId: 'codex', agentSessionId: 'A', workspaceId: 'ws', workspaceName: 'Work', workspaceDir: '/project', tabId: 't',
    });
    expect(a.status).toBe('pending');
  });
  it('backfills navigation for older entry-less indices from their known workspace', async () => {
    const data = JSON.parse(mocks.files.get(file)!);
    data.sessionWorkflow = { statuses: {}, collapsed: {}, sessions: { 'codex:A': { workspaceId: 'ws', tabId: 't', status: 'pending' } } };
    mocks.files.set(file, JSON.stringify(data));
    await synchronizeSessionWorkflow([], {});
    expect((await getWorkspaces()).sessionWorkflow?.sessions?.['codex:A'].navigation).toMatchObject({
      providerId: 'codex', agentSessionId: 'A', workspaceDir: '/project',
    });
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
