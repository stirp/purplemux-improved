import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ files: new Map<string, string>(), fail: false, readFail: false, broadcast: vi.fn() }));
vi.mock('os', () => ({ default: { homedir: () => '/terminal-commands-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => {
    if (mocks.readFail) throw Object.assign(new Error('Denied'), { code: 'EACCES' });
    if (!mocks.files.has(file)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
    return mocks.files.get(file)!;
  },
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
import { getTerminalCommands, updateTerminalCommand, updateActive } from '@/lib/workspace-store';

const file = '/terminal-commands-test/.purplemux/workspaces.json';
const value = { name: '查看状态', command: 'git status' };
beforeEach(() => {
  mocks.files.clear();
  mocks.fail = false;
  mocks.readFail = false;
  vi.clearAllMocks();
  (globalThis as { __purplemuxWorkspacesContentCache?: string }).__purplemuxWorkspacesContentCache = undefined;
  mocks.files.set(file, JSON.stringify({ workspaces: [], groups: [], sidebarCollapsed: false, sidebarWidth: 240 }));
});

describe('terminal command persistence', () => {
  it('defaults old configurations to empty and persists create, edit, delete', async () => {
    expect(await getTerminalCommands()).toEqual([]);
    const [created] = await updateTerminalCommand({ action: 'create', value });
    expect(created.id).toBeTruthy();
    expect(await getTerminalCommands()).toEqual([created]);
    await updateTerminalCommand({ action: 'edit', id: created.id, value: { name: '新名称', command: 'pwd' } });
    expect(await getTerminalCommands()).toEqual([{ id: created.id, name: '新名称', command: 'pwd' }]);
    await updateTerminalCommand({ action: 'delete', id: created.id });
    expect(await getTerminalCommands()).toEqual([]);
    expect(mocks.broadcast).toHaveBeenCalledTimes(3);
  });

  it('serializes concurrent creation and preserves workspace metadata in both directions', async () => {
    await Promise.all(Array.from({ length: 5 }, (_, index) => updateTerminalCommand({ action: 'create', value: { ...value, name: `${index}` } })));
    expect(await getTerminalCommands()).toHaveLength(5);
    expect(JSON.parse(mocks.files.get(file)!).sidebarWidth).toBe(240);
    await updateActive({ sidebarWidth: 300 });
    expect(await getTerminalCommands()).toHaveLength(5);
  });

  it('does not persist or broadcast failed writes and allows retry', async () => {
    const before = mocks.files.get(file);
    mocks.fail = true;
    await expect(updateTerminalCommand({ action: 'create', value })).rejects.toThrow('disk full');
    expect(mocks.files.get(file)).toBe(before);
    expect(mocks.broadcast).not.toHaveBeenCalled();
    mocks.fail = false;
    await updateTerminalCommand({ action: 'create', value });
    expect(await getTerminalCommands()).toHaveLength(1);
  });

  it('rejects unknown IDs and the 51st command', async () => {
    await expect(updateTerminalCommand({ action: 'edit', id: 'missing', value })).rejects.toMatchObject({ status: 404 });
    await expect(updateTerminalCommand({ action: 'delete', id: 'missing' })).rejects.toMatchObject({ status: 404 });
    await Promise.all(Array.from({ length: 50 }, () => updateTerminalCommand({ action: 'create', value })));
    await expect(updateTerminalCommand({ action: 'create', value })).rejects.toMatchObject({ status: 409 });
    expect(await getTerminalCommands()).toHaveLength(50);
  });

  it('does not overwrite unreadable or corrupt configuration', async () => {
    mocks.readFail = true;
    await expect(getTerminalCommands()).rejects.toThrow('Denied');
    await expect(updateTerminalCommand({ action: 'create', value })).rejects.toThrow('Denied');
    mocks.readFail = false;
    mocks.files.set(file, '{broken');
    await expect(getTerminalCommands()).rejects.toThrow();
    await expect(updateTerminalCommand({ action: 'create', value })).rejects.toThrow();
    expect(mocks.files.get(file)).toBe('{broken');
  });
});
