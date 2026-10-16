import { create } from 'zustand';
import { useRouter } from 'next/router';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useWebviewStore from '@/hooks/use-webview-store';
import useMobileLayoutActions from '@/hooks/use-mobile-layout-actions';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import { useLayoutStore } from '@/hooks/use-layout';

interface ISidebarActionsState {
  onSelectWorkspace: ((id: string) => void) | null;
  workspaceRevealRequest: { workspaceId: string } | null;
  revealWorkspace: (workspaceId: string) => void;
  register: (handler: (id: string) => void) => void;
  unregister: () => void;
}

const useSidebarActions = create<ISidebarActionsState>((set) => ({
  onSelectWorkspace: null,
  workspaceRevealRequest: null,
  revealWorkspace: (workspaceId) => set({ workspaceRevealRequest: { workspaceId } }),
  register: (handler) => set({ onSelectWorkspace: handler }),
  unregister: () => set({ onSelectWorkspace: null }),
}));

export const selectWorkspace = (workspaceId: string, navigateHome: () => void, options?: { reveal?: boolean }) => {
  if (options?.reveal !== false) useSidebarActions.getState().revealWorkspace(workspaceId);
  const registered = useSidebarActions.getState().onSelectWorkspace
    ?? useMobileLayoutActions.getState().onSelectWorkspace;
  useWebviewStore.getState().hide();
  if (registered) {
    registered(workspaceId);
  } else {
    const { activeWorkspaceId } = useWorkspaceStore.getState();
    if (workspaceId !== activeWorkspaceId) {
      useLayoutStore.getState().clearLayout();
      useTabMetadataStore.getState().reset();
      useWorkspaceStore.getState().switchWorkspace(workspaceId);
    }
  }
  navigateHome();
};

export const useSelectWorkspace = () => {
  const router = useRouter();
  return (workspaceId: string, options?: { reveal?: boolean }) => selectWorkspace(workspaceId, () => {
    if (router.pathname !== '/') router.push('/');
  }, options);
};

export default useSidebarActions;
