import { beforeEach, describe, expect, it } from 'vitest';
import { changeTabPanelType, ensureTabAgentIdentity, getTabAgentProviderId } from '@/lib/tab-agent-identity';
import { collectWorkSessions, reconcileSessionWorkflow } from '@/lib/session-workflow';
import { formatTabTitle } from '@/lib/tab-title';
import useTabStore, { getInitialTabStateFromLayoutTab } from '@/hooks/use-tab-store';
import { isAgentSwitchBlocked } from '@/lib/agent-switch-lock';
import { applyAgentCheckResult } from '@/lib/agent-check';
import type { ITab, TPanelType } from '@/types/terminal';

const tab = (panelType: TPanelType): ITab => ({ id: 'tab', name: '', order: 0, sessionName: 'tmux', panelType });
beforeEach(() => useTabStore.setState({ tabs: {} }));

describe('persistent agent identity independent of view and foreground command', () => {
  it.each(['codex-cli', 'claude-code'] as const)('retains %s through view changes and JSON round trips before the first prompt', (panel) => {
    const original = tab(panel);
    const terminal = changeTabPanelType(original, 'terminal');
    const restored = JSON.parse(JSON.stringify(terminal)) as ITab;
    ensureTabAgentIdentity(restored);
    expect(restored.agentState).toMatchObject({ providerId: panel === 'codex-cli' ? 'codex' : 'claude', sessionId: null });
    expect(changeTabPanelType(restored, panel).agentState).toEqual(restored.agentState);
    expect(original.agentState).toBeUndefined();
  });

  it('recovers legacy Claude terminal data without classifying an ordinary node terminal', () => {
    const legacy = { ...tab('terminal'), claudeSessionId: 'legacy', claudeSummary: 'summary' };
    expect(getInitialTabStateFromLayoutTab(legacy)).toMatchObject({ agentProviderId: 'claude', agentSessionId: 'legacy' });
    const ordinary = tab('terminal');
    ensureTabAgentIdentity(ordinary);
    expect(getTabAgentProviderId(ordinary)).toBeUndefined();
    expect(formatTabTitle('node|/project', ordinary.panelType)).toBe('node');
  });

  it('preserves the root and user metadata without duplicating a session in Terminal view', () => {
    const binding = { providerId: 'codex', sessionId: 'root', jsonlPath: '/root.jsonl', summary: 'Review' };
    const terminal = changeTabPanelType({ ...tab('codex-cli'), agentState: binding, cliState: 'busy' }, 'terminal');
    expect(terminal.agentState).toEqual(binding);
    expect(formatTabTitle('node|/project', terminal.panelType, getTabAgentProviderId(terminal))).toBe('Codex');
    const tabs = { tab: { workspaceId: 'ws', ...getInitialTabStateFromLayoutTab(terminal), cliState: 'busy' as const } };
    const workflow = reconcileSessionWorkflow({ statuses: { 'codex:tab:tab': 'completed' }, collapsed: {} }, [], tabs);
    expect(collectWorkSessions([], tabs, workflow)).toMatchObject([{ key: 'codex:root', status: 'completed' }]);
    expect(collectWorkSessions([], { tab: { workspaceId: 'ws', panelType: 'terminal', agentProviderId: 'codex' } }, { statuses: {}, collapsed: {} }))
      .toMatchObject([{ key: 'codex:tab:tab' }]);
    expect(collectWorkSessions([], { tab: { workspaceId: 'ws', panelType: 'terminal', agentSessionId: 'unowned' } }, { statuses: {}, collapsed: {} })).toEqual([]);
  });

  it('keeps root identity across a child process check, confirmed exit and reconnect', () => {
    const layoutTab = { ...tab('terminal'), agentState: { providerId: 'codex', sessionId: 'root', jsonlPath: '/root.jsonl', summary: null } };
    const store = useTabStore.getState();
    store.initTab('tab', { ...getInitialTabStateFromLayoutTab(layoutTab), cliState: 'busy' });
    store.setDetectedAgent('tab', { running: true, checkedAt: 10, providerId: 'codex', sessionId: 'review-child' });
    expect(useTabStore.getState().tabs.tab.agentSessionId).toBe('root');
    store.setDetectedAgent('tab', { running: false, checkedAt: 20 });
    store.setDetectedAgent('tab', { running: true, checkedAt: 15, providerId: 'claude', sessionId: 'late' });
    expect(useTabStore.getState().tabs.tab).toMatchObject({ agentProcess: false, agentProviderId: 'codex', agentSessionId: 'root' });
    expect(isAgentSwitchBlocked({ current: 'terminal', target: 'claude-code', agentProcess: false, cliState: 'busy', runningAgentPanelType: 'codex-cli' })).toBe(false);
    store.syncAllFromServer({ tab: { workspaceId: 'ws', panelType: 'terminal', cliState: 'inactive', agentProviderId: 'codex', agentSessionId: 'root' } });
    expect(useTabStore.getState().tabs.tab.agentSessionId).toBe('root');
  });

  it('initializes the explicitly selected provider without borrowing the old native session', () => {
    const original = { ...tab('terminal'), agentState: { providerId: 'codex', sessionId: 'root', jsonlPath: '/root.jsonl', summary: 'Review' } };
    const next = changeTabPanelType(original, 'claude-code');
    expect(next.agentState).toEqual({ providerId: 'claude', sessionId: null, jsonlPath: null, summary: null });
    expect(original.agentState.sessionId).toBe('root');
  });

  it('does not turn an invalid process response into exit evidence that unlocks a running agent', () => {
    const store = useTabStore.getState();
    store.initTab('tab', { panelType: 'terminal', agentProviderId: 'codex', agentProcess: true, agentProcessCheckedAt: 10, cliState: 'busy' });
    applyAgentCheckResult('tab', { checkedAt: 20 });
    expect(useTabStore.getState().tabs.tab).toMatchObject({ agentProcess: true, agentProcessCheckedAt: 10 });
    expect(isAgentSwitchBlocked({ current: 'terminal', target: 'claude-code', agentProcess: true, cliState: 'busy', runningAgentPanelType: 'codex-cli' })).toBe(true);
  });

  it('blocks switching after a newer activity event invalidates a previous exit check', () => {
    const input = { current: 'terminal' as const, target: 'claude-code' as const, agentProcess: false, cliState: 'busy' as const, runningAgentPanelType: 'codex-cli' as const };
    expect(isAgentSwitchBlocked({ ...input, agentProcessCheckedAt: 10, lastAgentEventAt: 20 })).toBe(true);
    expect(isAgentSwitchBlocked({ ...input, agentProcessCheckedAt: 30, lastAgentEventAt: 20 })).toBe(false);
  });
});
