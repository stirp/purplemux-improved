import { create } from 'zustand';
import Router from 'next/router';
import { navigateToTabOrCreate, useLayoutStore } from '@/hooks/use-layout';
import { selectWorkspace } from '@/hooks/use-sidebar-actions';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { ISessionHistoryEntry } from '@/types/session-history';
import type { IWorkspace } from '@/types/terminal';

interface ISessionNavigationState {
  revealedWorkspaceId: string | null;
}

const useSessionNavigation = create<ISessionNavigationState>(() => ({ revealedWorkspaceId: null }));

useWorkspaceStore.subscribe((state, previous) => {
  if (state.activeWorkspaceId !== previous.activeWorkspaceId
    && state.activeWorkspaceId !== useSessionNavigation.getState().revealedWorkspaceId) {
    useSessionNavigation.setState({ revealedWorkspaceId: null });
  }
});

export const getSessionNavigationGroupId = (workspaces: IWorkspace[], workspaceId: string | null): string | null => {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  let workspace = workspaceId ? byId.get(workspaceId) : undefined;
  const visited = new Set<string>();
  while (workspace?.parentWorkspaceId && !visited.has(workspace.id)) {
    visited.add(workspace.id);
    const parent = byId.get(workspace.parentWorkspaceId);
    if (!parent) break;
    workspace = parent;
  }
  return workspace?.groupId ?? null;
};

export const toggleSessionNavigationGroup = (groupId: string) => {
  const store = useWorkspaceStore.getState();
  const revealedId = useSessionNavigation.getState().revealedWorkspaceId;
  const temporarilyExpanded = revealedId === store.activeWorkspaceId
    && getSessionNavigationGroupId(store.workspaces, revealedId) === groupId
    && store.groups.some((group) => group.id === groupId && group.collapsed);
  useSessionNavigation.setState({ revealedWorkspaceId: null });
  if (!temporarilyExpanded) store.toggleGroupCollapsed(groupId);
};

const enterSessionTab = (workspaceId: string, tabId: string) => {
  const store = useLayoutStore.getState();
  const switching = workspaceId !== useWorkspaceStore.getState().activeWorkspaceId;
  selectWorkspace(workspaceId, () => {
    if (Router.pathname !== '/') Router.push('/');
  });
  useWorkspaceStore.getState().setSidebarTab('workspace');
  useSessionNavigation.setState({ revealedWorkspaceId: workspaceId });
  if (Router.pathname === '/' && store.workspaceId === workspaceId && store.focusTab(tabId)) return;
  useLayoutStore.setState({ pendingFocusTabId: tabId });
  if (Router.pathname === '/' && store.workspaceId === workspaceId) {
    store.setWorkspaceId(workspaceId);
    void store.fetchLayout();
  } else if (switching && useLayoutStore.getState().layout) {
    store.clearLayout();
  }
};

export const navigateToSession = async (entry: ISessionHistoryEntry, resolvedTabId: string | null = null): Promise<void> => {
  if (useWorkspaceStore.getState().isLoading) {
    await useWorkspaceStore.getState().fetchWorkspaces();
    if (useWorkspaceStore.getState().isLoading || useWorkspaceStore.getState().error) return;
  }
  await navigateToTabOrCreate(
    entry.workspaceId, resolvedTabId ?? entry.tabId, entry.agentSessionId,
    entry.workspaceName, entry.workspaceDir, entry.providerId,
    { onNavigate: enterSessionTab, requireExistingTab: !entry.agentSessionId },
  );
};

export default useSessionNavigation;
