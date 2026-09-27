import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(), kill: vi.fn(), panes: vi.fn(), layout: vi.fn(),
  collect: vi.fn(), cleanup: vi.fn(), removeLayout: vi.fn(), events: [] as string[],
}));
vi.mock('os', () => ({ default: { homedir: () => '/workspace-delete-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => mocks.files.get(file),
  mkdir: async () => {},
  writeFile: async (file: string, content: string) => { mocks.files.set(file, content); },
  rename: async (from: string, to: string) => { mocks.files.set(to, mocks.files.get(from)!); mocks.files.delete(from); },
} }));
vi.mock('@/lib/tmux', () => ({ killSession: mocks.kill, getAllPanesInfo: mocks.panes, listSessions: vi.fn() }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: vi.fn() }));
vi.mock('@/lib/layout-store', () => ({
  readLayoutFile: mocks.layout, resolveLayoutFile: (id: string) => id,
  collectAllTabs: (root: { tabs: unknown[] }) => root.tabs, removeLayoutFile: mocks.removeLayout,
}));
vi.mock('@/lib/workspace-sessions', () => ({ collectWorkspaceSessions: mocks.collect, deleteWorkspaceSessions: mocks.cleanup }));
import { deleteWorkspace } from '@/lib/workspace-store';
const file = '/workspace-delete-test/.purplemux/workspaces.json';
const tabs = [{ id: 'tab', sessionName: 'pt-ws-one-tab', agentState: { providerId: 'codex', sessionId: 'thread' } }];
const workspaces = () => JSON.parse(mocks.files.get(file)!).workspaces;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.events = [];
  mocks.files.clear();
  (globalThis as { __purplemuxWorkspacesContentCache?: string }).__purplemuxWorkspacesContentCache = undefined;
  mocks.files.set(file, JSON.stringify({ workspaces: [{ id: 'ws-one', name: 'One', directories: ['/repo'] }], groups: [] }));
  mocks.layout.mockResolvedValue({ root: { tabs } });
  mocks.collect.mockImplementation(async () => { mocks.events.push('collect'); return [{ provider: 'codex', sessionId: 'thread' }]; });
  mocks.panes.mockResolvedValue(new Map());
  mocks.kill.mockImplementation(async () => { mocks.events.push('kill'); });
  mocks.cleanup.mockImplementation(async () => { mocks.events.push('cleanup'); });
  mocks.removeLayout.mockImplementation(async () => { mocks.events.push('layout'); });
});
describe('workspace deletion with original sessions', () => {
  it('collects IDs before closing tabs and deletes originals before removing workspace metadata', async () => {
    expect(await deleteWorkspace('ws-one')).toBe(true);
    expect(mocks.events).toEqual(['collect', 'kill', 'cleanup', 'layout']);
    expect(mocks.cleanup).toHaveBeenCalledWith('ws-one', [{ provider: 'codex', sessionId: 'thread' }]);
    expect(workspaces()).toEqual([]);
  });
  it('retains workspace and layout for retry if native cleanup fails', async () => {
    mocks.cleanup.mockRejectedValue(new Error('Codex unavailable'));
    await expect(deleteWorkspace('ws-one')).rejects.toThrow('Codex unavailable');
    expect(workspaces()).toHaveLength(1);
    expect(mocks.removeLayout).not.toHaveBeenCalled();
  });
  it('never deletes originals when a terminal survives shutdown or the query fails', async () => {
    mocks.panes.mockResolvedValue(new Map([['pt-ws-one-tab', {}]]));
    await expect(deleteWorkspace('ws-one')).rejects.toThrow('still running');
    expect(mocks.cleanup).not.toHaveBeenCalled();
    mocks.panes.mockRejectedValue(new Error('tmux unavailable'));
    await expect(deleteWorkspace('ws-one')).rejects.toThrow('tmux unavailable');
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(workspaces()).toHaveLength(1);
  });
  it('preserves native sessions when automatically removing an empty workspace', async () => {
    mocks.layout.mockResolvedValue({ root: { tabs: [] } });
    expect(await deleteWorkspace('ws-one', false)).toBe(true);
    expect(mocks.collect).not.toHaveBeenCalled();
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(workspaces()).toEqual([]);
  });
  it('cleans historical sessions even if the layout has already disappeared', async () => {
    mocks.layout.mockResolvedValue(null);
    await deleteWorkspace('ws-one');
    expect(mocks.collect).toHaveBeenCalledWith('ws-one', []);
    expect(mocks.cleanup).toHaveBeenCalledOnce();
  });
});
