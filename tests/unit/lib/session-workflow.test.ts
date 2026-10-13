import { describe, expect, it } from 'vitest';
import { aggregateWorkStatus, collectWorkSessions, reconcileSessionWorkflow, type ISessionWorkflow } from '@/lib/session-workflow';
import type { ISessionHistoryEntry } from '@/types/session-history';

const workflow: ISessionWorkflow = { statuses: {}, collapsed: {} };
const entry = (overrides: Partial<ISessionHistoryEntry> = {}): ISessionHistoryEntry => ({
  id: 'e1', workspaceId: 'ws', workspaceName: 'Workspace', workspaceDir: '/project', tabId: 't1',
  providerId: 'codex', agentSessionId: 's1', prompt: 'Work', result: 'Result', startedAt: 1,
  completedAt: 2, duration: 1, dismissedAt: null, toolUsage: {}, touchedFiles: [], ...overrides,
});

describe('session work status', () => {
  it('consumes first-binding fallback even when the native identity is deleted', () => {
    const original: ISessionWorkflow = {
      statuses: { 'codex:tab:t1': 'completed' }, collapsed: {}, deleted: ['codex:A'],
      sessions: { 'codex:tab:t1': { workspaceId: 'ws', tabId: 't1', status: 'pending' } },
    };
    const tab = { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 'A' };
    expect(collectWorkSessions([], { t1: tab }, original)).toEqual([]);
    const bound = reconcileSessionWorkflow(original, [], { t1: tab });
    expect(bound.statuses).toEqual({});
    expect(bound.sessions).toEqual({});
    expect(bound.tabBindings).toEqual({ 'codex:tab:t1': 'codex:A' });
    expect(collectWorkSessions([], {}, bound)).toEqual([]);
    const next = reconcileSessionWorkflow(bound, [], { t1: { ...tab, agentSessionId: 'B' } });
    expect(collectWorkSessions([], {}, next)).toMatchObject([{ key: 'codex:B', status: 'pending' }]);
    expect(next.statuses).toEqual({});
    expect(original.statuses['codex:tab:t1']).toBe('completed');
  });
  it('keeps finished turns in review even after notification dismissal', () => {
    expect(collectWorkSessions([entry({ dismissedAt: 4 })], {}, workflow)[0].status).toBe('review');
  });
  it('deduplicates turns and merges the live tab by provider/session identity', () => {
    const sessions = collectWorkSessions([entry(), entry({ id: 'e2', completedAt: 3 })], {
      t2: { workspaceId: 'ws', agentProviderId: 'codex', agentSessionId: 's1', cliState: 'busy' },
    }, workflow);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ status: 'in-progress', tabId: 't2', entry: { id: 'e2' } });
    expect(sessions[0].olderEntries.map((e) => e.id)).toEqual(['e1']);
  });
  it('preserves a manual choice across runtime changes and new turns', () => {
    for (const cliState of ['busy', 'needs-input', 'ready-for-review', 'inactive'] as const) {
      expect(collectWorkSessions([entry(), entry({ id: 'new', completedAt: 10 })], {
        t1: { workspaceId: 'ws', agentProviderId: 'codex', agentSessionId: 's1', cliState },
      }, { ...workflow, statuses: { 'codex:s1': 'completed' } })[0].status).toBe('completed');
    }
  });
  it('separates providers with identical session IDs and ignores non-agent panels', () => {
    const sessions = collectWorkSessions([entry(), entry({ id: 'claude', providerId: 'claude' })], {
      shell: { workspaceId: 'ws', panelType: 'terminal', cliState: 'idle' },
    }, { ...workflow, statuses: { 'codex:s1': 'pending' } });
    expect(sessions.map((s) => s.status)).toEqual(['pending', 'review']);
  });
  it('supports unstarted agent tabs and legacy history without native IDs', () => {
    const sessions = collectWorkSessions([entry({ agentSessionId: null })], {
      new: { workspaceId: 'ws', panelType: 'codex-cli', cliState: 'inactive' },
    }, { ...workflow, statuses: { 'codex:history:e1': 'completed' } });
    expect(sessions.map((s) => s.status)).toEqual(['completed', 'pending']);
  });
  it('consumes fallback status on first binding without leaking it to another session', () => {
    const original: ISessionWorkflow = { statuses: { 'codex:tab:t1': 'completed' }, collapsed: {} };
    const first = reconcileSessionWorkflow(original, [], {
      t1: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 's1', cliState: 'idle' },
    });
    expect(first.statuses).toEqual({ 'codex:s1': 'completed' });
    expect(first.tabBindings).toEqual({ 'codex:tab:t1': 'codex:s1' });
    expect(collectWorkSessions([], {}, first)[0].status).toBe('completed');
    const second = reconcileSessionWorkflow(first, [], {
      t1: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 's2', cliState: 'idle' },
    });
    expect(collectWorkSessions([], {}, second).find((s) => s.key === 'codex:s2')?.status).toBe('pending');
    expect(second.statuses['codex:s2']).toBeUndefined();
    const repeated = reconcileSessionWorkflow(second, [], {
      t1: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 's2', cliState: 'idle' },
    });
    expect(collectWorkSessions([], {}, repeated).find((s) => s.key === 'codex:s2')?.status).toBe('pending');
    expect(original.statuses).toEqual({ 'codex:tab:t1': 'completed' });
  });
  it('keeps explicit native status when consuming fallback, and restores automatic correctly', () => {
    const bound = reconcileSessionWorkflow({
      statuses: { 'codex:tab:t1': 'completed', 'codex:s1': 'pending' }, collapsed: {},
    }, [entry()], { t1: { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 's1' } });
    expect(bound.statuses).toEqual({ 'codex:s1': 'pending' });
    expect(collectWorkSessions([], {}, { ...bound, statuses: {} })[0].status).toBe('review');
  });
  it('keeps indexed navigation and workspace association after every turn is pruned', () => {
    const indexed = reconcileSessionWorkflow({ ...workflow, statuses: { 'codex:s1': 'completed' } }, [entry()], {});
    const restored = collectWorkSessions([], {}, JSON.parse(JSON.stringify(indexed)));
    expect(restored).toHaveLength(1);
    expect(restored[0]).toMatchObject({ key: 'codex:s1', workspaceId: 'ws', status: 'completed', entry: { agentSessionId: 's1', workspaceDir: '/project' } });
    expect(aggregateWorkStatus(restored.map((s) => s.status))).toBe('completed');
  });
  it('does not duplicate the indexed latest turn still in history', () => {
    const indexed = reconcileSessionWorkflow(workflow, [entry()], {});
    const restored = collectWorkSessions([entry()], {}, indexed);
    expect(restored[0].olderEntries).toEqual([]);
    expect(restored).toHaveLength(1);
  });
  it('uses all related sessions for workspace completion', () => {
    expect(aggregateWorkStatus([])).toBe('pending');
    expect(aggregateWorkStatus(['completed', 'pending'])).toBe('pending');
    expect(aggregateWorkStatus(['completed', 'review', 'pending'])).toBe('review');
    expect(aggregateWorkStatus(['completed', 'review', 'in-progress'])).toBe('in-progress');
    expect(aggregateWorkStatus(['completed', 'completed'])).toBe('completed');
  });
});
