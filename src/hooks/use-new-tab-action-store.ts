import { create } from 'zustand';

interface INewTabActionState {
  pending: Record<string, string>;
  start: (workspaceId: string, key: string) => boolean;
  finish: (workspaceId: string) => void;
}

const useNewTabActionStore = create<INewTabActionState>((set, get) => ({
  pending: {},
  start: (workspaceId, key) => {
    if (get().pending[workspaceId]) return false;
    set((state) => ({ pending: { ...state.pending, [workspaceId]: key } }));
    return true;
  },
  finish: (workspaceId) => set((state) => {
    const pending = { ...state.pending };
    delete pending[workspaceId];
    return { pending };
  }),
}));

export default useNewTabActionStore;
