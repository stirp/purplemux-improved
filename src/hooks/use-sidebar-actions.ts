import { create } from 'zustand';
import { useRouter } from 'next/router';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useWebviewStore from '@/hooks/use-webview-store';
import useMobileLayoutActions from '@/hooks/use-mobile-layout-actions';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';

interface ISidebarActionsState {
  onSelectWorkspace: ((id: string) => void) | null;
  register: (handler: (id: string) => void) => void;
  unregister: () => void;
}

const useSidebarActions = create<ISidebarActionsState>((set) => ({
  onSelectWorkspace: null,
  register: (handler) => set({ onSelectWorkspace: handler }),
  unregister: () => set({ onSelectWorkspace: null }),
}));

export const selectWorkspace = (workspaceId: string, navigateHome: () => void) => {
  const registered = useSidebarActions.getState().onSelectWorkspace
    ?? useMobileLayoutActions.getState().onSelectWorkspace;
  useWebviewStore.getState().hide();
  if (registered) {
    registered(workspaceId);
  } else {
    const { activeWorkspaceId } = useWorkspaceStore.getState();
    if (workspaceId !== activeWorkspaceId) {
      useTabMetadataStore.getState().reset();
      useWorkspaceStore.getState().switchWorkspace(workspaceId);
    }
  }
  navigateHome();
};

export const useSelectWorkspace = () => {
  const router = useRouter();
  return (workspaceId: string) => selectWorkspace(workspaceId, () => {
    if (router.pathname !== '/') router.push('/');
  });
};

export default useSidebarActions;
