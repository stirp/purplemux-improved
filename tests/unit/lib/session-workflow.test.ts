import { describe, expect, it } from 'vitest';
import { aggregateWorkStatus, collectWorkSessions, type ISessionWorkflow } from '@/lib/session-workflow';
import type { ISessionHistoryEntry } from '@/types/session-history';

const workflow: ISessionWorkflow = { statuses: {}, collapsed: {} };
const entry = (overrides: Partial<ISessionHistoryEntry> = {}): ISessionHistoryEntry => ({
  id: 'e1', workspaceId: 'ws', workspaceName: 'Workspace', workspaceDir: '/project', tabId: 't1',
  providerId: 'codex', agentSessionId: 's1', prompt: 'Work', result: 'Result', startedAt: 1,
  completedAt: 2, duration: 1, dismissedAt: null, toolUsage: {}, touchedFiles: [], ...overrides,
});

describe('session work status', () => {
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
  it('uses all related sessions for workspace completion', () => {
    expect(aggregateWorkStatus([])).toBe('pending');
    expect(aggregateWorkStatus(['completed', 'pending'])).toBe('pending');
    expect(aggregateWorkStatus(['completed', 'review', 'pending'])).toBe('review');
    expect(aggregateWorkStatus(['completed', 'review', 'in-progress'])).toBe('in-progress');
    expect(aggregateWorkStatus(['completed', 'completed'])).toBe('completed');
  });
});
