import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ITab } from '@/types/terminal';
import { changeTabPanelType } from '@/lib/tab-agent-identity';

const mocks = vi.hoisted(() => ({
  tab: {} as ITab, running: true, snapshot: vi.fn(), persist: vi.fn(),
  watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));
vi.mock('fs', async (original) => ({ ...await original<typeof import('fs')>(), watch: mocks.watch }));
vi.mock('fs/promises', () => ({ default: { access: async () => {} } }));
vi.mock('@/lib/workspace-store', () => ({
  getWorkspaces: async () => ({ workspaces: [{ id: 'ws' }] }), synchronizeSessionWorkflow: async () => {},
}));
vi.mock('@/lib/layout-store', () => ({
  setLayoutReconciler() {}, resolveLayoutFile: () => '/layout.json',
  readLayoutFile: async () => ({ root: {} }), collectAllTabs: () => [mocks.tab],
  updateTabCliStatus: async () => {}, updateTabAgentState: mocks.persist,
}));
vi.mock('@/lib/process-utils', () => ({ getChildPids: async () => [] }));
vi.mock('@/lib/tmux', () => ({
  SAFE_SHELLS: new Set(['bash']), getListeningPorts: async () => [], getPaneTitle: async () => 'node|/project',
}));
vi.mock('@/lib/providers/registry', () => {
  const provider = (id: string) => ({
    id, isAgentRunning: async () => mocks.running,
    readJsonlPath: (tab: ITab) => tab.agentState?.jsonlPath,
    readSessionId: (tab: ITab) => tab.agentState?.sessionId,
    readSummary: (tab: ITab) => tab.agentState?.summary,
    sessionIdFromJsonlPath: (file: string | null) => file?.split('/').pop()?.replace('.jsonl', '') ?? null,
    readRuntimeSnapshot: mocks.snapshot, parsePaneTitle: () => null,
    detectActiveSession: async () => ({ status: mocks.running ? 'running' : 'not-running', jsonlPath: '/review-child.jsonl', sessionId: 'review-child' }),
  });
  return {
    getProvider: (id: string) => provider(id),
    getProviderByPanelType: (panel: string) => panel === 'codex-cli' ? provider('codex') : panel === 'claude-code' ? provider('claude') : null,
  };
});
vi.mock('@/lib/codex-rate-limits-cache', () => ({ cacheCodexRateLimitsFromJsonl: async () => {} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug() {}, warn() {}, info() {}, error() {} }) }));
vi.mock('@/lib/push-subscriptions', () => ({ getSubscriptions: async () => [], isAnyDeviceVisible: () => true }));

import { getStatusManager } from '@/lib/status-manager';
import { collectWorkSessions } from '@/lib/session-workflow';

const manager = getStatusManager();
const panes = new Map([['tmux', { pid: 123, command: 'node', path: '/project', windowActivity: 0 }]]);
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.clearAllMocks();
  manager.removeTab('tab');
  mocks.running = true;
  mocks.snapshot.mockResolvedValue({ idle: false, stale: false, lastAssistantSnippet: 'Reviewing', currentAction: null });
  mocks.tab = { id: 'tab', sessionName: 'tmux', name: '', order: 0, panelType: 'codex-cli', cliState: 'idle',
    agentState: { providerId: 'codex', sessionId: 'root', jsonlPath: '/root.jsonl', summary: 'Review' } };
});
afterEach(() => {
  manager.shutdown(); manager.removeTab('tab'); vi.clearAllTimers(); vi.useRealTimers();
});

describe('status polling with durable Tab ownership', () => {
  it.each(['codex', 'claude'])('keeps %s bound across view changes, node observations and runtime reconstruction', async (providerId) => {
    mocks.tab.panelType = providerId === 'codex' ? 'codex-cli' : 'claude-code';
    mocks.tab.agentState!.providerId = providerId;
    await manager.poll(panes);
    manager.handleProviderEvent(providerId, 'tmux', { kind: 'prompt-submit' });
    mocks.tab = changeTabPanelType(mocks.tab, 'terminal');
    await manager.poll(panes);
    expect(manager.getAllForClient().tab).toMatchObject({ panelType: 'terminal', agentProviderId: providerId, agentSessionId: 'root', cliState: 'busy', currentProcess: 'node' });
    expect(mocks.snapshot).toHaveBeenCalledWith('/root.jsonl');
    expect(mocks.snapshot).not.toHaveBeenCalledWith('/review-child.jsonl');
    expect(manager.applyAgentHookMeta(providerId === 'codex' ? 'claude' : 'codex', 'tmux', { sessionId: 'foreign' })).toBeNull();
    expect(collectWorkSessions([], manager.getAllForClient(), { statuses: {}, collapsed: {} })).toMatchObject([{ key: providerId + ':root' }]);
    manager.removeTab('tab');
    await manager.poll(panes);
    expect(manager.getAllForClient().tab).toMatchObject({ panelType: 'terminal', agentProviderId: providerId, agentSessionId: 'root' });
  });

  it('marks a terminal-view agent inactive on exit while keeping its recoverable binding', async () => {
    mocks.tab = changeTabPanelType(mocks.tab, 'terminal');
    await manager.poll(panes);
    mocks.running = false;
    await manager.poll(new Map([['tmux', { ...panes.get('tmux')!, command: 'bash' }]]));
    expect(manager.getAllForClient().tab).toMatchObject({ agentProviderId: 'codex', agentSessionId: 'root', cliState: 'inactive' });
    expect(manager.areSessionsIdle(['tmux'], panes)).toBe(false);
  });

  it('does not create an agent binding for an unowned node terminal', async () => {
    mocks.tab = { id: 'tab', sessionName: 'tmux', name: '', order: 0, panelType: 'terminal' };
    await manager.poll(panes);
    expect(manager.getAllForClient().tab.agentProviderId).toBeUndefined();
    expect(collectWorkSessions([], manager.getAllForClient(), { statuses: {}, collapsed: {} })).toEqual([]);
  });
});
