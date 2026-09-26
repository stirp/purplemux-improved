import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ source: vi.fn(), measure: vi.fn(), preview: vi.fn(), cleanup: vi.fn(), inspect: vi.fn(), sync: vi.fn(), fetch: vi.fn(), save: vi.fn(), review: vi.fn(), draft: vi.fn(), push: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaceById: mocks.source }));
vi.mock('@/lib/worktree-organization', () => ({ measureWorktree: mocks.measure, previewWorktreeCleanup: mocks.preview, cleanupWorktrees: mocks.cleanup }));
vi.mock('@/lib/worktree-sync', () => ({ inspectWorktreeSync: mocks.inspect, synchronizeWorktree: mocks.sync, fetchWorktreeRemotes: mocks.fetch }));
vi.mock('@/lib/worktree-delivery', () => ({ saveWorktreeReview: mocks.save, refreshWorktreeReview: mocks.review }));
vi.mock('@/lib/worktree-draft', () => ({ createWorktreeDraft: mocks.draft, pushWorktreeBranch: mocks.push }));
import handler from '@/pages/api/workspace/worktree-actions';
const item = { repositoryId: '/repo/.git', directory: '/task', head: 'a'.repeat(40), branch: 'task/one' };
const source = { id: 'ws-source', directories: ['/repo'] };
const call = async (data: object, method = 'POST') => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
  await handler({ method, body: { workspaceId: source.id, ...data } } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => { vi.resetAllMocks(); mocks.source.mockResolvedValue(source); });
describe('worktree action API', () => {
  it('requires POST, known actions, and bounded unique batch selections', async () => {
    expect((await call({}, 'GET')).status).toHaveBeenCalledWith(405);
    expect((await call({ action: 'forceRemove', item })).status).toHaveBeenCalledWith(400);
    expect((await call({ action: 'cleanup', items: [] })).status).toHaveBeenCalledWith(400);
    expect((await call({ action: 'cleanup', items: [item, item] })).status).toHaveBeenCalledWith(400);
    expect((await call({ action: 'cleanup', items: Array.from({ length: 51 }, (_, n) => ({ ...item, directory: `/task${n}` })) })).status).toHaveBeenCalledWith(400);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });
  it('validates draft inputs and keeps publishing separate from draft creation', async () => {
    const draft = { action: 'createDraft', item, remote: 'origin', provider: 'github', targetBranch: 'main', title: 'Draft', body: 'line 1\nline 2' };
    expect((await call({ ...draft, title: '  ' })).status).toHaveBeenCalledWith(400);
    expect((await call({ ...draft, provider: 'other' })).status).toHaveBeenCalledWith(400);
    expect((await call({ ...draft, body: 'x'.repeat(20001) })).status).toHaveBeenCalledWith(400);
    expect(mocks.draft).not.toHaveBeenCalled();
    await call(draft);
    expect(mocks.draft).toHaveBeenCalledWith(source, item, expect.objectContaining(draft));
    expect(mocks.push).not.toHaveBeenCalled();
    await call({ action: 'pushBranch', item, remote: 'origin' });
    expect(mocks.push).toHaveBeenCalledWith(source, item, 'origin');
  });
  it('requires both source and target snapshots for merge/rebase', async () => {
    expect((await call({ action: 'merge', item, targetRef: 'main' })).status).toHaveBeenCalledWith(400);
    await call({ action: 'rebase', item, targetRef: 'refs/heads/main', targetHead: 'b'.repeat(40) });
    expect(mocks.sync).toHaveBeenCalledWith(source, item, 'rebase', 'refs/heads/main', 'b'.repeat(40));
  });
  it('keeps preview read-only and preserves individual cleanup outcomes', async () => {
    mocks.preview.mockResolvedValue([{ ...item, blockers: ['dirty'] }]);
    expect((await call({ action: 'previewCleanup', items: [item] })).json).toHaveBeenCalledWith([{ ...item, blockers: ['dirty'] }]);
    expect(mocks.cleanup).not.toHaveBeenCalled();
    const result = { removedWorkspaceIds: [], warnings: [], results: [{ directory: '/task', ok: false, code: 'dirty' }] };
    mocks.cleanup.mockResolvedValue(result);
    expect((await call({ action: 'cleanup', items: [item] })).json).toHaveBeenCalledWith(result);
  });
  it('passes conflict results through without treating HTTP success as completed Git work', async () => {
    mocks.sync.mockResolvedValue({ ok: false, operation: 'rebase', output: 'CONFLICT' });
    expect((await call({ action: 'continue', item: { ...item, branch: null } })).json).toHaveBeenCalledWith({ ok: false, operation: 'rebase', output: 'CONFLICT' });
    mocks.source.mockResolvedValue(undefined);
    expect((await call({ action: 'measure', item })).status).toHaveBeenCalledWith(404);
    expect(mocks.measure).not.toHaveBeenCalled();
  });
});
