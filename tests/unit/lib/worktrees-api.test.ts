import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ source: vi.fn(), overview: vi.fn(), adopt: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaceById: mocks.source }));
vi.mock('@/lib/worktree-manager', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/worktree-manager')>();
  return { ...original, getWorktreeOverview: mocks.overview, adoptWorktree: mocks.adopt, removeManagedWorktree: mocks.remove };
});
import handler from '@/pages/api/workspace/worktrees';
import { WorktreeError } from '@/lib/worktree-manager';
const source = { id: 'ws-source', directories: ['/repo'] };
const body = { workspaceId: source.id, repositoryId: '/repo/.git', directory: '/task', head: 'a'.repeat(40), branch: 'task/one', deleteBranch: false };
const call = async (method: string, data: unknown = body) => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, body: data, query: data } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.source.mockResolvedValue(source);
  mocks.overview.mockResolvedValue({ repositories: [], errors: [] });
  mocks.adopt.mockResolvedValue({ id: 'ws-task' });
  mocks.remove.mockResolvedValue({ removedWorkspaceIds: [], warnings: [] });
});
describe('worktree management API', () => {
  it('validates and forwards the confirmed ignored paths', async () => {
    await call('DELETE', { ...body, confirmedIgnoredPaths: ['node_modules/', '.env'] });
    expect(mocks.remove).toHaveBeenCalledWith(source, { ...body, confirmedIgnoredPaths: ['node_modules/', '.env'] });
    expect((await call('DELETE', { ...body, confirmedIgnoredPaths: true })).status).toHaveBeenCalledWith(400);
  });
  it('lists without mutations and disables caching', async () => {
    const res = await call('GET');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mocks.overview).toHaveBeenCalledWith(source);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.adopt).not.toHaveBeenCalled();
  });
  it('validates method, source and deletion snapshot', async () => {
    expect((await call('PATCH')).status).toHaveBeenCalledWith(405);
    expect((await call('GET', { workspaceId: '../../escape' })).status).toHaveBeenCalledWith(400);
    expect((await call('DELETE', { ...body, head: '' })).status).toHaveBeenCalledWith(400);
    expect((await call('DELETE', { ...body, deleteBranch: 'false' })).status).toHaveBeenCalledWith(400);
    expect((await call('DELETE', { ...body, branch: undefined })).status).toHaveBeenCalledWith(400);
    mocks.source.mockResolvedValue(undefined);
    expect((await call('POST')).status).toHaveBeenCalledWith(404);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.adopt).not.toHaveBeenCalled();
  });
  it('adopts an existing worktree and forwards deletion options without force', async () => {
    expect((await call('POST')).json).toHaveBeenCalledWith({ id: 'ws-task' });
    expect(mocks.adopt).toHaveBeenCalledWith(source, '/repo/.git', '/task');
    await call('DELETE', { ...body, force: true });
    expect(mocks.remove).toHaveBeenCalledWith(source, {
      workspaceId: source.id, repositoryId: '/repo/.git', directory: '/task', head: body.head, branch: 'task/one', deleteBranch: false,
    });
  });
  it('returns structured conflicts and preserves partial success information', async () => {
    mocks.remove.mockRejectedValueOnce(new WorktreeError('dirty'));
    const failed = await call('DELETE');
    expect(failed.status).toHaveBeenCalledWith(409);
    expect(failed.json).toHaveBeenCalledWith({ error: 'dirty', code: 'dirty' });
    mocks.remove.mockResolvedValue({ removedWorkspaceIds: ['ws-task'], warnings: ['branchRetained'] });
    expect((await call('DELETE')).json).toHaveBeenCalledWith({ removedWorkspaceIds: ['ws-task'], warnings: ['branchRetained'] });
  });
});
