import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), write: vi.fn(), broadcast: vi.fn() }));
vi.mock('os', () => ({ default: { homedir: () => '/workspace-reorder-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => mocks.files.get(file),
  writeFile: mocks.write,
  rename: async (from: string, to: string) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
} }));
vi.mock('@/lib/tmux', () => ({}));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: mocks.broadcast }));
vi.mock('@/lib/layout-store', () => ({}));
vi.mock('@/lib/providers/registry', () => ({}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: vi.fn() }) }));
import { reorderWorkspaces } from '@/lib/workspace-store';
import handler from '@/pages/api/workspace/reorder';

const file = '/workspace-reorder-test/.purplemux/workspaces.json';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.files.clear();
  (globalThis as { __purplemuxWorkspacesContentCache?: string }).__purplemuxWorkspacesContentCache = undefined;
  mocks.files.set(file, JSON.stringify({
    workspaces: [
      { id: 'ws-a', name: 'A', directories: ['/a'] },
      { id: 'ws-b', name: 'B', directories: ['/b'] },
    ], groups: [{ id: 'grp-one', name: 'One' }], sidebarCollapsed: false, sidebarWidth: 240,
  }));
  mocks.write.mockImplementation(async (name: string, content: string) => { mocks.files.set(name, content); });
});

describe('persisted workspace reordering', () => {
  it.each([
    ['ws-a', 'ws-a'], ['ws-a'], ['ws-a', 'ws-missing'], ['ws-a', 'ws-b', 'ws-a'],
  ])('rejects invalid order %j without changing workspace records', async (...ids) => {
    const before = mocks.files.get(file);
    expect(await reorderWorkspaces(ids.map((id) => ({ id })))).toBe(false);
    expect(mocks.files.get(file)).toBe(before);
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('persists a complete permutation and preserves workspace details', async () => {
    expect(await reorderWorkspaces([{ id: 'ws-b', groupId: 'grp-one' }, { id: 'ws-a' }])).toBe(true);
    expect(JSON.parse(mocks.files.get(file)!).workspaces).toEqual([
      { id: 'ws-b', name: 'B', directories: ['/b'], groupId: 'grp-one' },
      { id: 'ws-a', name: 'A', directories: ['/a'] },
    ]);
    expect(mocks.broadcast).toHaveBeenCalledWith({ type: 'workspace' });
  });

  it.each([
    { items: [{ id: 'ws-a' }, { id: 'ws-a' }] },
    { workspaceIds: ['ws-a', 'ws-a'] },
  ])('returns HTTP 400 for duplicate IDs in either request format', async (body) => {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    await handler({ method: 'PATCH', body } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
