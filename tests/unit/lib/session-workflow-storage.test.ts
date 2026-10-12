import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), fail: false, broadcast: vi.fn() }));
vi.mock('os', () => ({ default: { homedir: () => '/workflow-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => mocks.files.get(file),
  mkdir: async () => {},
  writeFile: async (file: string, content: string) => {
    if (mocks.fail) throw new Error('disk full');
    mocks.files.set(file, content);
  },
  rename: async (from: string, to: string) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
  unlink: async (file: string) => { mocks.files.delete(file); },
} }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: mocks.broadcast }));
vi.mock('@/lib/tmux', () => ({}));
vi.mock('@/lib/layout-store', () => ({}));
vi.mock('@/lib/providers/registry', () => ({ listProviders: () => [] }));
import { getWorkspaces, updateSessionWorkflow, updateActive } from '@/lib/workspace-store';

const file = '/workflow-test/.purplemux/workspaces.json';
beforeEach(() => {
  mocks.files.clear();
  mocks.fail = false;
  vi.clearAllMocks();
  (globalThis as { __purplemuxWorkspacesContentCache?: string }).__purplemuxWorkspacesContentCache = undefined;
  mocks.files.set(file, JSON.stringify({ workspaces: [{ id: 'ws', name: 'Work', directories: ['/project'] }], groups: [],
    sidebarCollapsed: false, sidebarWidth: 240 }));
});
describe('persistent workflow preferences', () => {
  it('reads legacy workspaces and preserves unrelated fields while saving concurrent updates', async () => {
    expect((await getWorkspaces()).sessionWorkflow).toBeUndefined();
    await Promise.all([
      updateSessionWorkflow({ key: 'codex:s1', status: 'completed' }),
      updateSessionWorkflow({ key: 'claude:s1', status: 'pending' }),
      updateSessionWorkflow({ section: 'review', collapsed: true }),
      updateActive({ sidebarWidth: 300 }),
    ]);
    const data = await getWorkspaces();
    expect(data.sessionWorkflow).toEqual({
      statuses: { 'codex:s1': 'completed', 'claude:s1': 'pending' }, collapsed: { review: true },
    });
    expect(data.sidebarWidth).toBe(300);
    expect(data.workspaces[0].name).toBe('Work');
    expect(mocks.broadcast).toHaveBeenCalledWith({ type: 'workspace' });
    await updateSessionWorkflow({ key: 'codex:s1', status: null });
    expect((await getWorkspaces()).sessionWorkflow?.statuses).toEqual({ 'claude:s1': 'pending' });
  });
  it('keeps saved state on write failure and releases the lock for retry', async () => {
    const before = mocks.files.get(file);
    mocks.fail = true;
    await expect(updateSessionWorkflow({ key: 'codex:s1', status: 'completed' })).rejects.toThrow('disk full');
    expect(mocks.files.get(file)).toBe(before);
    expect(mocks.broadcast).not.toHaveBeenCalled();
    mocks.fail = false;
    await updateSessionWorkflow({ section: 'completed', collapsed: true });
    expect((await getWorkspaces()).sessionWorkflow?.collapsed.completed).toBe(true);
  });
});
