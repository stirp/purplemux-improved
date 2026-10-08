import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import Router from 'next/router';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useWebviewStore from '@/hooks/use-webview-store';
import useTabStore from '@/hooks/use-tab-store';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import useSidebarActions from '@/hooks/use-sidebar-actions';
import useMobileLayoutActions from '@/hooks/use-mobile-layout-actions';
import useSessionNavigation, { navigateToSession, getSessionNavigationGroupId, toggleSessionNavigationGroup } from '@/hooks/use-session-navigation';
import { navigateToTab, navigateToTabOrCreate, useLayoutStore } from '@/hooks/use-layout';
import type { ILayoutData, ITab } from '@/types/terminal';
import type { ISessionHistoryEntry } from '@/types/session-history';

vi.mock('next/router', () => ({ default: { pathname: '/', push: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
vi.mock('@/hooks/use-web-input', () => ({ clearInputDraft: vi.fn() }));

const snapshotStore = <T,>(store: StoreApi<T>) => {
  const snapshot = store.getState();
  return () => store.setState(snapshot, true);
};
const restoreStores = [
  snapshotStore(useWorkspaceStore), snapshotStore(useWebviewStore), snapshotStore(useTabStore),
  snapshotStore(useTabMetadataStore), snapshotStore(useSidebarActions), snapshotStore(useMobileLayoutActions),
  snapshotStore(useSessionNavigation), snapshotStore(useLayoutStore),
];

const tab = (providerId: 'claude' | 'codex', id = 'tab-target'): ITab => ({
  id, name: 'Session', order: 0, sessionName: 'session-target',
  agentState: { providerId, sessionId: 'agent-target', jsonlPath: null, summary: null },
});
const layout = (tabs: ITab[]): ILayoutData => ({
  root: { type: 'pane', id: 'pane-target', tabs, activeTabId: tabs[0]?.id ?? null },
  activePaneId: 'pane-target', updatedAt: '2026-10-08T00:00:00Z',
});
const entry = (providerId: 'claude' | 'codex' = 'claude'): ISessionHistoryEntry => ({
  id: 'history', workspaceId: 'ws-target', workspaceName: 'Target', workspaceDir: '/project',
  tabId: 'tab-old', providerId, agentSessionId: 'agent-target', prompt: null, result: null,
  startedAt: 0, completedAt: 0, duration: 0, dismissedAt: null, toolUsage: {}, touchedFiles: [],
});
const response = (data: unknown, ok = true) => ({ ok, json: async () => data }) as Response;

beforeEach(() => {
  restoreStores.forEach((restore) => restore());
  useLayoutStore.getState().setWorkspaceId('ws-other');
  vi.clearAllMocks();
  Router.pathname = '/';
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(null)));
  useWorkspaceStore.setState({
    activeWorkspaceId: 'ws-other', sidebarTab: 'sessions', isLoading: false, error: null,
    workspaces: [
      { id: 'ws-parent', name: 'Parent', directories: ['/project'], groupId: 'group-target' },
      { id: 'ws-target', name: 'Target', directories: ['/project/worktree'], parentWorkspaceId: 'ws-parent' },
    ], groups: [{ id: 'group-target', name: 'Projects', collapsed: true }],
  });
  useWebviewStore.setState({ activeId: 'webview' });
  useLayoutStore.setState({ layout: layout([]), pendingFocusTabId: null });
});
afterEach(() => {
  restoreStores.forEach((restore) => restore());
  useLayoutStore.getState().setWorkspaceId(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const expectSelected = (workspaceId = 'ws-target') => {
  const state = useWorkspaceStore.getState();
  expect(state.activeWorkspaceId).toBe(workspaceId);
  expect(state.sidebarTab).toBe('workspace');
  expect(useWebviewStore.getState().activeId).toBeNull();
  expect(state.groups[0].collapsed).toBe(true);
  expect(useSessionNavigation.getState().revealedWorkspaceId).toBe(workspaceId);
  expect(getSessionNavigationGroupId(state.workspaces, workspaceId)).toBe('group-target');
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/group/'))).toBe(false);
};
const expectUnchanged = () => {
  expect(useWorkspaceStore.getState().sidebarTab).toBe('sessions');
  expect(useWebviewStore.getState().activeId).toBe('webview');
  expect(useWorkspaceStore.getState().groups[0].collapsed).toBe(true);
  expect(useSessionNavigation.getState().revealedWorkspaceId).toBeNull();
};

describe('Sessions project navigation', () => {
  it.each(['claude', 'codex'] as const)('validates and enters an existing %s session', async (providerId) => {
    vi.mocked(fetch).mockResolvedValueOnce(response(layout([tab(providerId)])));
    await navigateToSession(entry(providerId), 'tab-target');
    expectSelected();
    expect(useLayoutStore.getState().pendingFocusTabId).toBe('tab-target');
  });
  it('focuses a validated tab in the current project', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-target' });
    useLayoutStore.getState().setWorkspaceId('ws-target');
    const otherTab = tab('claude', 'tab-other');
    otherTab.agentState = { ...otherTab.agentState!, sessionId: 'agent-other' };
    const data = layout([otherTab, tab('claude')]);
    useLayoutStore.setState({ layout: data });
    vi.mocked(fetch).mockResolvedValueOnce(response(data));
    await navigateToSession(entry());
    expectSelected();
    const root = useLayoutStore.getState().layout!.root;
    expect(root.type === 'pane' && root.activeTabId).toBe('tab-target');
  });
  it('returns from another route', async () => {
    Router.pathname = '/stats';
    vi.mocked(fetch).mockResolvedValueOnce(response(layout([tab('claude')])));
    await navigateToSession(entry());
    expectSelected();
    expect(Router.push).toHaveBeenCalledWith('/');
  });
  it.each(['desktop', 'mobile'] as const)('uses the registered %s workspace selection handler', async (surface) => {
    const select = vi.fn((id: string) => {
      useLayoutStore.getState().clearLayout();
      useTabMetadataStore.getState().reset();
      useWorkspaceStore.getState().switchWorkspace(id);
    });
    if (surface === 'desktop') useSidebarActions.getState().register(select);
    else useMobileLayoutActions.getState().register({ onSelectWorkspace: select });
    vi.mocked(fetch).mockResolvedValueOnce(response(layout([tab('claude')])));
    await navigateToSession(entry());
    expect(select).toHaveBeenCalledExactlyOnceWith('ws-target');
    expectSelected();
  });
  it.each(['claude', 'codex'] as const)('creates and fetches a new %s tab in the current project', async (providerId) => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-target' });
    useLayoutStore.getState().setWorkspaceId('ws-target');
    vi.mocked(fetch)
      .mockResolvedValueOnce(response(layout([])))
      .mockResolvedValueOnce(response(tab(providerId)))
      .mockResolvedValueOnce(response(layout([tab(providerId)])));
    await navigateToSession(entry(providerId));
    await vi.waitFor(() => expect(useLayoutStore.getState().layout?.root).toEqual(layout([tab(providerId)]).root));
    expectSelected();
    expect(vi.mocked(fetch).mock.calls.filter(([url, options]) => String(url) === '/api/layout?workspace=ws-target' && options?.method !== 'PATCH')).toHaveLength(2);
  });
  it('recreates a project and reveals its actual group', async () => {
    useWorkspaceStore.setState({ createWorkspace: async () => {
      const created = { id: 'ws-recreated', name: 'Restored', directories: ['/project'], groupId: 'group-target' };
      useWorkspaceStore.setState({ workspaces: [...useWorkspaceStore.getState().workspaces, created] });
      return created;
    } });
    vi.mocked(fetch).mockResolvedValueOnce(response(layout([tab('claude')])));
    await navigateToSession({ ...entry(), workspaceId: 'ws-deleted' });
    expectSelected('ws-recreated');
  });
  it('removes temporary reveal when leaving the target project', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(layout([tab('claude')])));
    await navigateToSession(entry());
    useWorkspaceStore.getState().switchWorkspace('ws-parent');
    expect(useSessionNavigation.getState().revealedWorkspaceId).toBeNull();
    expect(useWorkspaceStore.getState().groups[0].collapsed).toBe(true);
  });
  it('collapses a temporarily revealed group without changing its saved preference', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(layout([tab('claude')])));
    await navigateToSession(entry());
    toggleSessionNavigationGroup('group-target');
    expect(useSessionNavigation.getState().revealedWorkspaceId).toBeNull();
    expect(useWorkspaceStore.getState().groups[0].collapsed).toBe(true);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/group/'))).toBe(false);
  });
  it.each(['layout', 'create', 'missing-path', 'invalid-tab', 'hydrate'] as const)('does not partially reveal on %s failure', async (failure) => {
    const history = entry();
    if (failure === 'missing-path') { history.workspaceId = 'ws-deleted'; history.workspaceDir = null; }
    if (failure === 'invalid-tab') history.agentSessionId = null;
    if (failure === 'hydrate') useWorkspaceStore.setState({ isLoading: true });
    vi.mocked(fetch).mockResolvedValueOnce(response(layout([]), failure === 'create' || failure === 'invalid-tab'))
      .mockResolvedValueOnce(response({}, false));
    await navigateToSession(history);
    expectUnchanged();
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('ws-other');
  });
  it('waits for hydration before resolving the session', async () => {
    useWorkspaceStore.setState({ isLoading: true, workspaces: [] });
    const workspaces = [{ id: 'ws-target', name: 'Target', directories: ['/project'], groupId: 'group-target' }];
    vi.mocked(fetch).mockResolvedValueOnce(response({ workspaces, groups: useWorkspaceStore.getState().groups, activeWorkspaceId: 'ws-other' }))
      .mockResolvedValueOnce(response(layout([tab('claude')])));
    await navigateToSession(entry());
    expectSelected();
  });
});

describe('generic navigation preserves sidebar preferences', () => {
  it.each(['/', '/stats'])('does not reveal projects from generic navigation on %s', (pathname) => {
    Router.pathname = pathname;
    navigateToTab('ws-target', 'tab-target');
    expectUnchanged();
  });
  it('keeps preferences for an invalid current tab', () => {
    useLayoutStore.getState().setWorkspaceId('ws-target');
    navigateToTab('ws-target', 'tab-missing');
    expectUnchanged();
  });
  it('preserves generic history recovery behavior', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(response(layout([tab('claude')])));
    await navigateToTabOrCreate('ws-target', 'tab-old', 'agent-target', 'Target', '/project');
    expectUnchanged();
  });
});
