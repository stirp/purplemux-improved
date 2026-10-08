import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Router from 'next/router';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useWebviewStore from '@/hooks/use-webview-store';
import { navigateToTab, navigateToTabOrCreate, useLayoutStore } from '@/hooks/use-layout';
import { getWorkspaceVisibility } from '@/lib/workspace-order';
import type { ILayoutData, ITab } from '@/types/terminal';

vi.mock('next/router', () => ({ default: { pathname: '/', push: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
vi.mock('@/hooks/use-web-input', () => ({ clearInputDraft: vi.fn() }));

const tab = (providerId: 'claude' | 'codex', id = 'tab-target'): ITab => ({
  id, name: 'Session', order: 0, sessionName: 'session-target',
  agentState: { providerId, sessionId: 'agent-target', jsonlPath: null, summary: null },
});

const layout = (tabs: ITab[]): ILayoutData => ({
  root: { type: 'pane', id: 'pane-target', tabs, activeTabId: tabs[0]?.id ?? null },
  activePaneId: 'pane-target', updatedAt: '2026-10-07T00:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  Router.pathname = '/';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  useWorkspaceStore.setState({
    activeWorkspaceId: 'ws-other', sidebarTab: 'sessions',
    workspaces: [
      { id: 'ws-parent', name: 'Parent', directories: ['/project'], groupId: 'group-target' },
      { id: 'ws-target', name: 'Target', directories: ['/project/worktree'], parentWorkspaceId: 'ws-parent' },
    ],
    groups: [{ id: 'group-target', name: 'Projects', collapsed: true }],
  });
  useWebviewStore.setState({ activeId: 'webview' });
  useLayoutStore.setState({ workspaceId: 'ws-other', layout: layout([]), pendingFocusTabId: null });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const expectProjectSelected = (workspaceId = 'ws-target') => {
  const state = useWorkspaceStore.getState();
  expect(state.activeWorkspaceId).toBe(workspaceId);
  expect(state.sidebarTab).toBe('workspace');
  expect(useWebviewStore.getState().activeId).toBeNull();
};

describe('session navigation synchronizes sidebar project', () => {
  it('selects a different project and exposes its collapsed ancestor group', () => {
    navigateToTab('ws-target', 'tab-target');
    expectProjectSelected();
    expect(useWorkspaceStore.getState().groups[0].collapsed).toBe(false);
    const state = useWorkspaceStore.getState();
    expect(getWorkspaceVisibility(state.workspaces, state.activeWorkspaceId).visibleIds.has('ws-target')).toBe(true);
    expect(useLayoutStore.getState().pendingFocusTabId).toBe('tab-target');
    expect(useLayoutStore.getState().layout).toBeNull();
  });

  it('reveals the project even when the target tab is in the current workspace', () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-target' });
    useLayoutStore.setState({ workspaceId: 'ws-target', layout: layout([tab('claude'), tab('claude', 'tab-other')]) });
    navigateToTab('ws-target', 'tab-other');
    expectProjectSelected();
    const root = useLayoutStore.getState().layout!.root;
    expect(root.type === 'pane' && root.activeTabId).toBe('tab-other');
  });

  it('returns from another route with the selected project and pending tab', () => {
    Router.pathname = '/stats';
    navigateToTab('ws-target', 'tab-target');
    expectProjectSelected();
    expect(Router.push).toHaveBeenCalledWith('/');
    expect(useLayoutStore.getState().pendingFocusTabId).toBe('tab-target');
  });

  it.each(['claude', 'codex'] as const)('reuses an existing %s session', async (providerId) => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => layout([tab(providerId)]) } as Response);
    await navigateToTabOrCreate('ws-target', 'tab-old', 'agent-target', 'Target', '/project/worktree', providerId);
    expectProjectSelected();
    expect(useLayoutStore.getState().pendingFocusTabId).toBe('tab-target');
  });

  it.each(['claude', 'codex'] as const)('reveals the current project after creating a %s resume tab', async (providerId) => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-target' });
    useLayoutStore.setState({ workspaceId: 'ws-target', layout: layout([]) });
    vi.spyOn(useLayoutStore.getState(), 'fetchLayout').mockResolvedValue(undefined);
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: true, json: async () => layout([]) } as Response)
      .mockResolvedValueOnce({ ok: true, json: async () => tab(providerId) } as Response);
    await navigateToTabOrCreate('ws-target', 'tab-old', 'agent-target', 'Target', '/project/worktree', providerId);
    expectProjectSelected();
    expect(useLayoutStore.getState().pendingFocusTabId).toBe('tab-target');
    expect(useLayoutStore.getState().fetchLayout).toHaveBeenCalled();
  });

  it('selects the actual workspace id after recreating a deleted project', async () => {
    vi.spyOn(useWorkspaceStore.getState(), 'createWorkspace').mockResolvedValue({
      id: 'ws-recreated', name: 'Restored', directories: ['/project'],
    });
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => layout([tab('claude')]) } as Response);
    await navigateToTabOrCreate('ws-deleted', 'tab-old', 'agent-target', 'Restored', '/project');
    expectProjectSelected('ws-recreated');
  });

  it.each(['missing-directory', 'layout-failure', 'create-failure'] as const)('preserves sidebar state on %s', async (failure) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: failure === 'create-failure', json: async () => layout([]) } as Response)
      .mockResolvedValueOnce({ ok: false } as Response);
    await navigateToTabOrCreate(failure === 'missing-directory' ? 'ws-deleted' : 'ws-target', 'tab-old', 'agent-target', 'Target', null);
    expect(useWorkspaceStore.getState().sidebarTab).toBe('sessions');
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-other');
    expect(useWorkspaceStore.getState().groups[0].collapsed).toBe(true);
    expect(useWebviewStore.getState().activeId).toBe('webview');
  });
});
