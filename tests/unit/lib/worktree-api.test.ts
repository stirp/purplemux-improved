import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ parent: vi.fn(), create: vi.fn(), list: vi.fn(), git: vi.fn(), inspect: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaceById: mocks.parent, createWorkspace: mocks.create, getWorkspaces: mocks.list }));
vi.mock('@/lib/git-worktree', () => ({ createGitWorktree: mocks.git, inspectWorktreeSource: mocks.inspect }));
import handler from '@/pages/api/workspace/worktree';
const options = { workspaceId: 'ws-parent', directoryIndex: 0, name: 'Task', branch: 'task/one', baseRef: 'HEAD' };
const child = { id: 'ws-child', directories: ['/worktree'], parentWorkspaceId: 'ws-parent' };
async function call(body = options, method = 'POST') {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, body, query: body } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.parent.mockResolvedValue({ id: 'ws-parent', directories: ['/repo'] });
  mocks.git.mockResolvedValue({ directory: '/worktree', repository: '/repo', branch: 'task/one', baseCommit: 'abc' });
  mocks.create.mockResolvedValue(child);
  mocks.list.mockResolvedValue({ workspaces: [] });
});
describe('worktree API', () => {
  it('registers the new directory as an independent child workspace', async () => {
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mocks.create).toHaveBeenCalledWith('/worktree', 'Task', undefined, {
      parentWorkspaceId: 'ws-parent', worktree: { repository: '/repo', branch: 'task/one', baseCommit: 'abc' },
    });
  });
  it('rejects invalid input and missing parents before Git changes', async () => {
    expect((await call({ ...options, workspaceId: '../escape' })).status).toHaveBeenCalledWith(400);
    mocks.parent.mockResolvedValue(undefined);
    expect((await call()).status).toHaveBeenCalledWith(404);
    expect(mocks.git).not.toHaveBeenCalled();
  });
  it('reports Git errors without registering a workspace', async () => {
    mocks.git.mockRejectedValue(new Error('Branch exists'));
    expect((await call()).json).toHaveBeenCalledWith({ error: 'Branch exists' });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('returns the preserved directory when registration fails, even if storage cannot be read', async () => {
    mocks.create.mockRejectedValue(new Error('Disk error'));
    mocks.list.mockRejectedValue(new Error('Disk error'));
    const res = await call();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ createdDirectory: '/worktree' }));
  });
  it('recovers registration that succeeded before prompt writing failed', async () => {
    mocks.create.mockRejectedValue(new Error('Prompts error'));
    mocks.list.mockResolvedValue({ workspaces: [child] });
    expect((await call()).json).toHaveBeenCalledWith(child);
  });
  it('inspects Git without modifying it', async () => {
    mocks.inspect.mockResolvedValue({ branch: 'main', dirty: true });
    expect((await call(options, 'GET')).json).toHaveBeenCalledWith({ branch: 'main', dirty: true });
    expect(mocks.git).not.toHaveBeenCalled();
  });
});
