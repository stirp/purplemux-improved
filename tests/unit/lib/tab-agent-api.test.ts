import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { ITab } from '@/types/terminal';

const mocks = vi.hoisted(() => ({ tab: {} as ITab }));
vi.mock('@/lib/cli-token', () => ({ verifyCliToken: () => true }));
vi.mock('@/lib/cli-utils', () => ({ findTab: async () => ({ workspaceId: 'ws', paneId: 'pane', tab: mocks.tab }) }));
vi.mock('@/lib/layout-store', () => ({
  getLayout: async () => ({ root: { type: 'pane', tabs: [mocks.tab] } }),
  readLayoutFile: async () => ({ root: { type: 'pane', tabs: [mocks.tab] } }),
  resolveLayoutFile: () => '/layout.json', parseSessionName: () => ({ wsId: 'ws' }),
  collectAllTabs: () => [mocks.tab],
}));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaceById: async () => ({ id: 'ws' }) }));
vi.mock('@/lib/tmux', () => ({ hasSession: async () => true, getSessionPanePid: async () => 123, getPaneCurrentCommand: async () => 'node' }));
vi.mock('@/lib/process-utils', () => ({ getChildPids: async () => [124] }));

import { claudeProvider } from '@/lib/providers/claude';
import { codexProvider } from '@/lib/providers/codex';
import checkAgent from '@/pages/api/check-agent';
import listTabs from '@/pages/api/cli/tabs';
import tabDetail from '@/pages/api/cli/tabs/[tabId]';
import tabStatus from '@/pages/api/cli/tabs/[tabId]/status';
import { changeTabPanelType } from '@/lib/tab-agent-identity';
import { applyAgentCheckResult } from '@/lib/agent-check';
import useTabStore, { getInitialTabStateFromLayoutTab } from '@/hooks/use-tab-store';

const invoke = async (handler: typeof checkAgent) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  await handler({ method: 'GET', query: { workspaceId: 'ws', tabId: 'tab', session: 'tmux' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  expect(res.status).toHaveBeenCalledWith(200);
  return res.json.mock.calls[0][0];
};
beforeEach(() => {
  useTabStore.setState({ tabs: {} });
  mocks.tab = { id: 'tab', sessionName: 'tmux', order: 0, name: '', panelType: 'terminal',
    agentState: { providerId: 'codex', sessionId: 'root', jsonlPath: '/root.jsonl', summary: null } };
  vi.spyOn(claudeProvider, 'isAgentRunning').mockResolvedValue(true);
  vi.spyOn(codexProvider, 'isAgentRunning').mockResolvedValue(true);
  vi.spyOn(codexProvider, 'detectActiveSession').mockResolvedValue({
    status: 'running', sessionId: 'review-child', jsonlPath: '/review-child.jsonl', pid: 124, startedAt: null, cwd: '/project',
  });
  vi.spyOn(claudeProvider, 'detectActiveSession').mockResolvedValue({
    status: 'running', sessionId: 'claude-live', jsonlPath: '/claude-live.jsonl', pid: 125, startedAt: null, cwd: '/project',
  });
});
afterEach(() => vi.restoreAllMocks());

describe('Tab identity API projections', () => {
  it.each([codexProvider, claudeProvider])('does not fall back to another process when bound $id has exited', async (provider) => {
    const other = provider.id === 'codex' ? claudeProvider : codexProvider;
    mocks.tab.agentState!.providerId = provider.id;
    vi.mocked(provider.isAgentRunning).mockResolvedValue(false);
    useTabStore.getState().initTab('tab', getInitialTabStateFromLayoutTab(mocks.tab));
    const result = await invoke(checkAgent);
    expect(result).toMatchObject({ running: false, sessionId: null });
    expect(other.isAgentRunning).not.toHaveBeenCalled();
    expect(other.detectActiveSession).not.toHaveBeenCalled();
    applyAgentCheckResult('tab', result);
    expect(useTabStore.getState().tabs.tab).toMatchObject({ agentProviderId: provider.id, agentSessionId: 'root', agentProcess: false });
    expect(mocks.tab.agentState).toMatchObject({ providerId: provider.id, sessionId: 'root' });
  });

  it('still discovers an agent for an unbound terminal', async () => {
    mocks.tab.agentState = undefined;
    vi.mocked(claudeProvider.isAgentRunning).mockResolvedValue(false);
    expect(await invoke(checkAgent)).toMatchObject({ running: true, providerId: 'codex', sessionId: 'review-child' });
    expect(claudeProvider.isAgentRunning).toHaveBeenCalled();
    expect(codexProvider.isAgentRunning).toHaveBeenCalled();
  });

  it('checks the newly selected provider after an explicit switch', async () => {
    mocks.tab = changeTabPanelType(mocks.tab, 'claude-code');
    expect(await invoke(checkAgent)).toMatchObject({ running: true, providerId: 'claude', sessionId: 'claude-live' });
    expect(codexProvider.isAgentRunning).not.toHaveBeenCalled();
  });

  it.each([listTabs, tabDetail, tabStatus])('returns the persisted provider and root identity in Terminal view', async (handler) => {
    const result = await invoke(handler);
    expect(result.tabs?.[0] ?? result).toMatchObject({ agentProviderId: 'codex', agentSessionId: 'root' });
  });
  it('checks the bound process before other providers and returns the root rather than a review child', async () => {
    expect(await invoke(checkAgent)).toMatchObject({ running: true, providerId: 'codex', sessionId: 'root', providerPanelType: 'codex-cli' });
    expect(claudeProvider.isAgentRunning).not.toHaveBeenCalled();
    expect(codexProvider.isAgentRunning).toHaveBeenCalledWith(123, [124]);
  });
  it('does not treat a persisted binding as evidence of a live process', async () => {
    vi.mocked(codexProvider.isAgentRunning).mockResolvedValue(false);
    vi.mocked(claudeProvider.isAgentRunning).mockResolvedValue(false);
    expect(await invoke(checkAgent)).toMatchObject({ running: false, sessionId: null });
    expect(mocks.tab.agentState?.sessionId).toBe('root');
  });
});
