// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import useWorkspaceExpansion from '@/hooks/use-workspace-expansion';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useSidebarActions, { selectWorkspace } from '@/hooks/use-sidebar-actions';
import useGlobalShortcuts from '@/hooks/use-global-shortcuts';
import useSessionNavigation, { navigateToSession } from '@/hooks/use-session-navigation';
import { useLayoutStore } from '@/hooks/use-layout';
import type { ILayoutData } from '@/types/terminal';
import type { ISessionHistoryEntry } from '@/types/session-history';

const hotkeys = vi.hoisted(() => new Map<string, (event: KeyboardEvent) => void>());
vi.mock('@/hooks/use-bound-hotkey', () => ({ default: (id: string, callback: (event: KeyboardEvent) => void) => hotkeys.set(id, callback) }));
vi.mock('next/router', () => ({ default: { pathname: '/' }, useRouter: () => ({ pathname: '/' }) }));

const initialWorkspace = useWorkspaceStore.getState();
const initialActions = useSidebarActions.getState();
const initialSession = useSessionNavigation.getState();
const initialLayout = useLayoutStore.getState();
let root: Root;
let container: HTMLDivElement;
let expansion: ReturnType<typeof useWorkspaceExpansion>;
let searching = false;
const Harness = () => {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const activeId = useWorkspaceStore((state) => state.activeWorkspaceId);
  const current = useWorkspaceExpansion(workspaces, activeId, searching);
  useLayoutEffect(() => { expansion = current; });
  useGlobalShortcuts();
  return createElement('div', null, [...current.visibility.visibleIds].join(','));
};
const render = async () => act(async () => root.render(createElement(Harness)));
const collapseParent = async () => act(async () => expansion.toggleWorkspace('parent'));
const expectRevealed = () => {
  expect(expansion.visibility.visibleIds.has('child')).toBe(true);
  expect(expansion.visibility.visibleIds.has('other-child')).toBe(true);
};

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  searching = false;
  useWorkspaceStore.setState({
    isLoading: false, activeWorkspaceId: 'child',
    workspaces: [
      { id: 'parent', name: 'Parent', directories: [] },
      { id: 'child', name: 'Child', directories: [], parentWorkspaceId: 'parent' },
      { id: 'other', name: 'Other', directories: [] },
      { id: 'other-child', name: 'Other child', directories: [], parentWorkspaceId: 'other' },
    ],
  });
  useSidebarActions.getState().register((id) => useWorkspaceStore.setState({ activeWorkspaceId: id }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await render();
  await act(async () => expansion.toggleWorkspace('other'));
  await collapseParent();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWorkspaceStore.setState(initialWorkspace, true);
  useSidebarActions.setState(initialActions, true);
  useSessionNavigation.setState(initialSession, true);
  useLayoutStore.setState(initialLayout, true);
  hotkeys.clear();
  vi.unstubAllGlobals();
});

it.each(['before', 'after'])('resolves an old create callback with the new node arriving %s the request', async (arrival) => {
  const onCreated = expansion.revealWorkspace;
  const addNode = () => useWorkspaceStore.setState((state) => ({
    workspaces: [...state.workspaces, { id: 'new', name: 'New worktree', directories: [], parentWorkspaceId: 'child' }],
  }));
  if (arrival === 'before') await act(async () => { addNode(); });
  await act(async () => {
    onCreated('new');
    useWorkspaceStore.setState({ activeWorkspaceId: 'new' });
  });
  if (arrival === 'after') await act(async () => { addNode(); });
  expect(expansion.visibility.visibleIds.has('new')).toBe(true);
  expectRevealed();
});

it('reveals the same active workspace on each shortcut invocation without changing sync behavior', async () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => useWorkspaceStore.setState((state) => ({ workspaces: [...state.workspaces] })));
    expect(expansion.visibility.visibleIds.has('child')).toBe(false);
    await act(async () => hotkeys.get('workspace.switch')!(new KeyboardEvent('keydown', { code: 'Digit2' })));
    expectRevealed();
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('child');
    await collapseParent();
  }
});

it('retains an unresolved navigation request when the navigation view mounts', async () => {
  await act(async () => root.unmount());
  useSidebarActions.getState().revealWorkspace('new');
  root = createRoot(container);
  await render();
  await act(async () => useWorkspaceStore.setState((state) => ({
    workspaces: [...state.workspaces, { id: 'new', name: 'New worktree', directories: [], parentWorkspaceId: 'child' }],
  })));
  expect(expansion.visibility.visibleIds.has('new')).toBe(true);
});

it('reveals the same active workspace on repeated Sessions navigation', async () => {
  const data: ILayoutData = {
    root: { type: 'pane', id: 'pane', activeTabId: 'tab', tabs: [
      { id: 'tab', name: 'Session', order: 0, sessionName: 'session', agentState: { providerId: 'claude', sessionId: 'agent', jsonlPath: null, summary: null } },
    ] }, activePaneId: 'pane', updatedAt: '2026-10-17T00:00:00Z',
  };
  const entry: ISessionHistoryEntry = {
    id: 'history', workspaceId: 'child', workspaceName: 'Child', workspaceDir: '/demo',
    tabId: 'tab', providerId: 'claude', agentSessionId: 'agent', prompt: null, result: null,
    startedAt: 0, completedAt: 0, duration: 0, dismissedAt: null, toolUsage: {}, touchedFiles: [],
  };
  useLayoutStore.getState().setWorkspaceId('child');
  useLayoutStore.setState({ layout: data });
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => data } as Response);
  for (let attempt = 0; attempt < 2; attempt++) {
    await act(async () => navigateToSession(entry));
    expectRevealed();
    await collapseParent();
  }
});

it('consumes search navigation without reopening the original tree after clearing search', async () => {
  searching = true;
  await render();
  await act(async () => selectWorkspace('child', vi.fn()));
  searching = false;
  await render();
  expect(expansion.visibility.visibleIds.has('child')).toBe(false);
  expect(expansion.visibility.visibleIds.has('other-child')).toBe(true);
});

it('does not reopen a search-selected path when selection completes after clearing search', async () => {
  await act(async () => useWorkspaceStore.setState({ activeWorkspaceId: 'other' }));
  useSidebarActions.getState().register(vi.fn());
  searching = true;
  await render();
  await act(async () => selectWorkspace('child', vi.fn()));
  searching = false;
  await render();
  await act(async () => useWorkspaceStore.setState({ activeWorkspaceId: 'child' }));
  expect(expansion.visibility.visibleIds.has('child')).toBe(false);
});

it('preserves mobile row collapse when selection completes asynchronously', async () => {
  await collapseParent();
  useSidebarActions.getState().register(vi.fn());
  await act(async () => {
    selectWorkspace('parent', vi.fn(), { reveal: false });
    expansion.toggleWorkspace('parent', true);
  });
  await act(async () => useWorkspaceStore.setState({ activeWorkspaceId: 'parent' }));
  expect(expansion.visibility.visibleIds.has('child')).toBe(false);
  expect(expansion.visibility.visibleIds.has('other-child')).toBe(true);
});
