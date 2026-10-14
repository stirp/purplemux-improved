import { describe, expect, it } from 'vitest';
import { agentSessionTitle, agentTabTitle } from '@/lib/agent-session-title';
import type { ITabState } from '@/hooks/use-tab-store';

const tab = (patch: Partial<ITabState>): ITabState => ({
  terminalConnected: false,
  agentProcess: true,
  agentProcessCheckedAt: 0,
  agentInstalled: true,
  sessionView: 'timeline',
  cliState: 'busy',
  isTimelineLoading: false,
  workspaceId: 'workspace',
  ...patch,
});

describe('agentSessionTitle', () => {
  it('prefers the current session title over the status summary', () => {
    expect(agentSessionTitle(tab({
      agentSessionId: 'current',
      agentSummary: 'Summary',
      sessionMetaCache: { sessionId: 'current', jsonlPath: null, meta: { title: 'Custom title' } as NonNullable<ITabState['sessionMetaCache']>['meta'] },
    }))).toBe('Custom title');
  });

  it('ignores a cached title from a previous session', () => {
    expect(agentSessionTitle(tab({
      agentSessionId: 'new',
      lastUserMessage: 'New prompt',
      sessionMetaCache: { sessionId: 'old', jsonlPath: null, meta: { title: 'Old title' } as NonNullable<ITabState['sessionMetaCache']>['meta'] },
    }))).toBe('New prompt');
  });

  it('uses a saved title for the active identity and ignores another session title', () => {
    const workflow = { statuses: {}, collapsed: {}, titles: { 'codex:one': 'Renamed' } };
    expect(agentSessionTitle(tab({ panelType: 'codex-cli', agentSessionId: 'one' }), workflow, 'tab-1')).toBe('Renamed');
    expect(agentSessionTitle(tab({ panelType: 'codex-cli', agentSessionId: 'two', lastUserMessage: 'Second' }), workflow, 'tab-1')).toBe('Second');
  });

  it('keeps a legacy manual Tab name above a title saved from another Tab', () => {
    const workflow = { statuses: {}, collapsed: {}, titles: { 'claude:shared': 'Shared title' } };
    const live = tab({ panelType: 'claude-code', agentSessionId: 'shared' });
    expect(agentTabTitle('My Tab', live, workflow, 'first-tab')).toBe('My Tab');
    expect(agentTabTitle('', live, workflow, 'second-tab')).toBe('Shared title');
  });
});
