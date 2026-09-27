import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ remove: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ deleteWorkspace: mocks.remove, renameWorkspace: vi.fn(), setWorkspaceGroup: vi.fn() }));
import handler from '@/pages/api/workspace/[workspaceId]';
const call = async (body?: unknown) => {
  const res = { status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method: 'DELETE', query: { workspaceId: 'ws-one' }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => { vi.resetAllMocks(); mocks.remove.mockResolvedValue(true); });
describe('workspace deletion API', () => {
  it('defaults to deleting original sessions and supports preserving history for automatic cleanup', async () => {
    expect((await call()).status).toHaveBeenCalledWith(204);
    expect(mocks.remove).toHaveBeenLastCalledWith('ws-one', true);
    await call({ deleteSessions: false });
    expect(mocks.remove).toHaveBeenLastCalledWith('ws-one', false);
  });
  it('rejects non-boolean options without performing deletion', async () => {
    expect((await call({ deleteSessions: 'false' })).status).toHaveBeenCalledWith(400);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('does not report success when original-session cleanup fails', async () => {
    mocks.remove.mockRejectedValue(new Error('native cleanup failed'));
    expect((await call()).status).toHaveBeenCalledWith(409);
  });
  it('returns not found for an unknown workspace', async () => {
    mocks.remove.mockResolvedValue(false);
    expect((await call()).status).toHaveBeenCalledWith(404);
  });
});
