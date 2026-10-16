import { useCallback, useMemo, useState } from 'react';
import { getWorkspaceAncestorIds, getWorkspaceVisibility } from '@/lib/workspace-order';
import type { IWorkspace } from '@/types/terminal';
import useSidebarActions from '@/hooks/use-sidebar-actions';

const useWorkspaceExpansion = (workspaces: IWorkspace[], activeWorkspaceId: string | null, searching: boolean) => {
  const activeId = workspaces.some((workspace) => workspace.id === activeWorkspaceId) ? activeWorkspaceId : null;
  const revealRequest = useSidebarActions((state) => state.workspaceRevealRequest);
  const [state, setState] = useState(() => ({
    activeId,
    selectedId: null as string | null,
    handledRevealRequest: null as typeof revealRequest,
    expandedIds: getWorkspaceAncestorIds(workspaces, activeId),
  }));

  const revealReady = revealRequest !== state.handledRevealRequest
    && (searching || workspaces.some((workspace) => workspace.id === revealRequest?.workspaceId));
  if (state.activeId !== activeId || revealReady) {
    // A row selection can update the active workspace after its collapse action.
    const expandedIds = new Set(state.expandedIds);
    if (!searching) {
      if (state.activeId !== activeId && state.selectedId !== activeId) {
        for (const id of getWorkspaceAncestorIds(workspaces, activeId)) expandedIds.add(id);
      }
      if (revealReady && revealRequest) {
        for (const id of getWorkspaceAncestorIds(workspaces, revealRequest.workspaceId)) expandedIds.add(id);
      }
    }
    setState({
      activeId,
      selectedId: revealReady ? revealRequest?.workspaceId ?? null : state.activeId !== activeId ? null : state.selectedId,
      handledRevealRequest: revealReady ? revealRequest : state.handledRevealRequest,
      expandedIds,
    });
  }

  const toggleWorkspace = useCallback((workspaceId: string, selecting = false) => {
    setState((previous) => {
      const expandedIds = new Set(previous.expandedIds);
      if (!searching) {
        if (expandedIds.has(workspaceId)) expandedIds.delete(workspaceId);
        else expandedIds.add(workspaceId);
      }
      return { ...previous, selectedId: selecting ? workspaceId : previous.selectedId, expandedIds };
    });
  }, [searching]);

  const visibility = useMemo(() => getWorkspaceVisibility(workspaces, state.expandedIds), [workspaces, state.expandedIds]);
  return { visibility, toggleWorkspace, revealWorkspace: useSidebarActions.getState().revealWorkspace };
};

export default useWorkspaceExpansion;
