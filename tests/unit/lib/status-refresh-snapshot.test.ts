import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ panes: vi.fn(), workspaces: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaces: mocks.workspaces }));
vi.mock('@/lib/tmux', async (original) => ({
  ...await original<typeof import('@/lib/tmux')>(), getAllPanesInfo: mocks.panes,
}));
import { getStatusManager } from '@/lib/status-manager';

afterEach(() => vi.resetAllMocks());
describe('status refresh pane snapshot', () => {
  it('does not query non-strict tmux again when a strict snapshot is provided', async () => {
    mocks.workspaces.mockResolvedValue({ workspaces: [] });
    mocks.panes.mockRejectedValue(new Error('tmux failed after strict query'));
    await expect(getStatusManager().poll(new Map())).resolves.toBeUndefined();
    expect(mocks.panes).not.toHaveBeenCalled();
  });
  it('retains the ordinary polling query when no snapshot is provided', async () => {
    mocks.workspaces.mockResolvedValue({ workspaces: [] });
    mocks.panes.mockResolvedValue(new Map());
    await getStatusManager().poll();
    expect(mocks.panes).toHaveBeenCalledTimes(1);
  });
});
