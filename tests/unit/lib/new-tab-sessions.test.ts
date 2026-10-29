import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadNewTabSessions, mergeNewTabSessions, type INewTabSession } from '@/lib/new-tab-sessions';
import type { ISessionHistoryEntry } from '@/types/session-history';
import type { ISessionWorkflow, IWorkflowTab } from '@/lib/session-workflow';

const workspace = { id: 'ws', name: 'Project', directories: ['/repo'] };
const native: INewTabSession = {
  key: 'codex:s1', title: 'Original title', updatedAt: 100,
  target: { workspaceId: 'ws', workspaceName: 'Project', workspaceDir: '/repo',
    providerId: 'codex', agentSessionId: 's1', tabId: '' },
};
afterEach(() => vi.unstubAllGlobals());

describe('new tab session data', () => {
  it('deduplicates native and reclaimed sessions while preserving renamed titles and resume directories', () => {
    const sessions = mergeNewTabSessions(workspace, [native], [], {}, {
      statuses: {}, collapsed: {}, titles: { 'codex:s1': 'Saved title' }, sessions: {
        'codex:s1': { workspaceId: 'ws', tabId: 'old', status: 'pending',
          navigation: { ...native.target, tabId: 'old', workspaceDir: '/repo/retained' } },
        'claude:s2': { workspaceId: 'ws', tabId: 'older', status: 'pending',
          navigation: { ...native.target, providerId: 'claude', agentSessionId: 's2' } },
        'codex:other': { workspaceId: 'other', tabId: 'other', status: 'pending',
          navigation: { ...native.target, workspaceId: 'other', agentSessionId: 'other' } },
      },
    });
    expect(sessions.map((session) => session.key)).toEqual(['codex:s1', 'claude:s2']);
    expect(sessions[0]).toMatchObject({ title: 'Saved title', target: { workspaceDir: '/repo/retained', tabId: 'old' } });
  });

  it('filters deleted identities and keeps same-id sessions from different providers', () => {
    const claude = { ...native, key: 'claude:s1', target: { ...native.target, providerId: 'claude' as const } };
    expect(mergeNewTabSessions(workspace, [native, claude], [], {}, {
      statuses: {}, collapsed: {}, deleted: ['codex:s1'],
    }).map((session) => session.key)).toEqual(['claude:s1']);
  });

  it.each(['retained', 'history', 'live'])('excludes native identities owned by another workspace via %s', (source) => {
    const target = { ...native.target, workspaceId: 'other', tabId: 'other-tab' };
    const workflow: ISessionWorkflow = { statuses: {}, collapsed: {} };
    const tabs: Record<string, IWorkflowTab> = {};
    const entries: ISessionHistoryEntry[] = [];
    if (source === 'retained') workflow.sessions = {
      [native.key]: { workspaceId: 'other', tabId: 'other-tab', status: 'pending', navigation: target },
    };
    if (source === 'history') entries.push({ ...target, id: 'history', prompt: 'Task', result: null,
      startedAt: 1, completedAt: 2, duration: 1, dismissedAt: null, toolUsage: {}, touchedFiles: [] });
    if (source === 'live') {
      workflow.sessions = { [native.key]: { workspaceId: 'ws', tabId: 'old', status: 'pending', navigation: native.target } };
      tabs['other-tab'] = { workspaceId: 'other', panelType: 'codex-cli', agentSessionId: 's1' };
    }
    const claude: INewTabSession = { ...native, key: 'claude:s1', target: { ...native.target, providerId: 'claude' } };
    expect(mergeNewTabSessions(workspace, [native, claude], entries, tabs, workflow).map((session) => session.key))
      .toEqual(['claude:s1']);
  });

  it('reads all Claude sessions in one request per directory and retains them if another provider fails', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      const cwd = url.searchParams.get('cwd');
      if (url.pathname.includes('codex')) return { ok: false };
      expect(url.searchParams.get('all')).toBe('true');
      expect(url.searchParams.has('offset')).toBe(false);
      return { ok: true, json: async () => ({ sessions: Array.from({ length: 250 }, (_, index) => ({
        sessionId: `${cwd}-${index}`, firstMessage: 'Message', lastActivityAt: '2026-10-29T00:00:00Z',
      })), hasMore: false }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await loadNewTabSessions(workspace, ['/repo', '/other dir']);
    expect(result.hasError).toBe(true);
    expect(result.sessions).toHaveLength(500);
    expect(result.sessions.filter((session) => session.target.workspaceDir === '/repo')).toHaveLength(250);
    expect(result.sessions.filter((session) => session.target.workspaceDir === '/other dir')).toHaveLength(250);
    expect(fetchMock.mock.calls.every(([url]) => !url.includes('tmuxSession'))).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('keeps other directories after a failed full read and can retry the failing source', async () => {
    let failing = true;
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost');
      const cwd = url.searchParams.get('cwd');
      if (url.pathname.includes('codex')) return { ok: true, json: async () => ({ sessions: [] }) };
      if (cwd === '/broken' && failing) throw new Error('offline');
      return { ok: true, json: async () => ({ sessions: [{ sessionId: cwd,
        firstMessage: 'Task', lastActivityAt: '2026-10-29T00:00:00Z' }], hasMore: false }) };
    }));
    const partial = await loadNewTabSessions(workspace, ['/repo', '/broken']);
    expect(partial.hasError).toBe(true);
    expect(partial.sessions.map((session) => session.target.workspaceDir)).toEqual(['/repo']);
    failing = false;
    const retried = await loadNewTabSessions(workspace, ['/repo', '/broken']);
    expect(retried.hasError).toBe(false);
    expect(retried.sessions).toHaveLength(2);
  });
});
