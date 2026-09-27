import { useEffect } from 'react';
import useWorkspaceStore from '@/hooks/use-workspace-store';

export const useAutoDeleteEmptyWorkspace = (
  allTabsEmpty: boolean,
  clearLayout: () => void,
) => {
  useEffect(() => {
    if (!allTabsEmpty) return;

    const {
      activeWorkspaceId,
      workspaces,
      switchWorkspace,
      deleteWorkspace,
      removeWorkspace,
      markPendingDelete,
      unmarkPendingDelete,
    } = useWorkspaceStore.getState();
    if (!activeWorkspaceId) return;

    const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
    const adjacent = workspaces[idx + 1] || workspaces[idx - 1];
    const deletedId = activeWorkspaceId;

    clearLayout();
    markPendingDelete(deletedId);

    if (adjacent) {
      removeWorkspace(deletedId);
      deleteWorkspace(deletedId, false).finally(() => unmarkPendingDelete(deletedId));
      switchWorkspace(adjacent.id);
    } else {
      deleteWorkspace(deletedId, false)
        .then(() => removeWorkspace(deletedId))
        .finally(() => unmarkPendingDelete(deletedId));
    }
  }, [allTabsEmpty, clearLayout]);
};
