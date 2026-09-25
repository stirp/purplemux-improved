import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
import useWorkspaceStore from '@/hooks/use-workspace-store';

const refresh = vi.fn(async () => {});
const fetchMock = vi.fn(async () => ({ ok: true }));
const initial = useWorkspaceStore.getState();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  useWorkspaceStore.setState({
    groups: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', collapsed: true }, { id: 'empty', name: 'Empty' }],
    workspaces: [
      { id: 'a1', name: 'A1', directories: [], groupId: 'a' },
      { id: 'a2', name: 'A2', directories: [], groupId: 'a' },
      { id: 'b1', name: 'B1', directories: [], groupId: 'b' },
      { id: 'u', name: 'Ungrouped', directories: [] },
    ],
    fetchWorkspaces: refresh,
  });
});
afterEach(() => { useWorkspaceStore.setState(initial); vi.unstubAllGlobals(); });

describe('workspace group reordering', () => {
  it('moves a collapsed group with its workspaces, preserving membership and internal order', () => {
    useWorkspaceStore.getState().reorderGroups(1, 0);
    const state = useWorkspaceStore.getState();
    expect(state.groups.map((group) => group.id)).toEqual(['b', 'a', 'empty']);
    expect(state.groups[0].collapsed).toBe(true);
    expect(state.workspaces.map((workspace) => [workspace.id, workspace.groupId])).toEqual([
      ['b1', 'b'], ['a1', 'a'], ['a2', 'a'], ['u', undefined],
    ]);
    expect(fetchMock).toHaveBeenCalledWith('/api/workspace/group/reorder', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ groupIds: ['b', 'a', 'empty'] }) }));
  });
  it('supports empty groups and moving groups down', () => {
    useWorkspaceStore.getState().reorderGroups(0, 2);
    expect(useWorkspaceStore.getState().groups.map((group) => group.id)).toEqual(['b', 'empty', 'a']);
    useWorkspaceStore.getState().reorderGroups(1, 0);
    expect(useWorkspaceStore.getState().groups.map((group) => group.id)).toEqual(['empty', 'b', 'a']);
  });
  it('ignores stale, invalid, and unchanged positions', () => {
    for (const [from, to] of [[-1, 0], [0, 99], [99, 0], [0, 0], [0.5, 1]]) {
      useWorkspaceStore.getState().reorderGroups(from, to);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().groups.map((group) => group.id)).toEqual(['a', 'b', 'empty']);
  });
  it('reports HTTP failures and reloads the persisted order', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    useWorkspaceStore.getState().reorderGroups(0, 1);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(toast.error).toHaveBeenCalledWith('reorderFailed');
  });
});
