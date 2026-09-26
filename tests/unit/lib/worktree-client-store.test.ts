import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useWorkspaceStore from '@/hooks/use-workspace-store';

const source = { id: 'ws-source', name: 'Source', directories: ['/repo'] };
const child = { id: 'ws-child', name: 'Child', directories: ['/task'], parentWorkspaceId: source.id };
const options = { repositoryId: '/repo/.git', directory: '/task', head: 'a'.repeat(40), branch: 'task/one', deleteBranch: false };
const response = (data: unknown, ok = true) => ({ ok, json: async () => data });

beforeEach(() => {
  useWorkspaceStore.setState({ workspaces: [source, child], groups: [], activeWorkspaceId: child.id, pendingDeleteIds: new Set() });
});
afterEach(() => vi.unstubAllGlobals());

describe('worktree client mutations', () => {
  it('keeps a late background sync from resurrecting a deleted workspace', async () => {
    let finishSync!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/workspace'
      ? new Promise((resolve) => { finishSync = resolve; })
      : Promise.resolve(response({ removedWorkspaceIds: [child.id], warnings: [] }))));
    const store = useWorkspaceStore.getState();
    const stale = store.syncWorkspaces();
    await store.removeWorktree(source.id, options);
    finishSync(response({ workspaces: [source, child], groups: [] }));
    await stale;
    expect(useWorkspaceStore.getState().workspaces).toEqual([source]);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(source.id);
  });

  it('registers adoption immediately and prevents older sync results from dropping it', async () => {
    useWorkspaceStore.setState({ workspaces: [source] });
    let finishSync!: (value: ReturnType<typeof response>) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/workspace'
      ? new Promise((resolve) => { finishSync = resolve; })
      : Promise.resolve(response(child))));
    const store = useWorkspaceStore.getState();
    const stale = store.syncWorkspaces();
    await store.adoptWorktree(source.id, options.repositoryId, options.directory);
    finishSync(response({ workspaces: [source], groups: [] }));
    await stale;
    await store.adoptWorktree(source.id, options.repositoryId, options.directory);
    expect(useWorkspaceStore.getState().workspaces).toEqual([source, child]);
  });

  it('preserves workspace state and exposes the reason when deletion is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: 'dirty', code: 'dirty' }, false)));
    await expect(useWorkspaceStore.getState().removeWorktree(source.id, options)).rejects.toMatchObject({ code: 'dirty' });
    expect(useWorkspaceStore.getState().workspaces).toEqual([source, child]);
  });
});
