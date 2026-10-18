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
import { getTerminalCommands, updateTerminalCommand, updateActive, getTerminalKeys, updateTerminalKeys } from '@/lib/workspace-store';
import { DEFAULT_TERMINAL_KEYS } from '@/lib/terminal-keys';

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
  it('persists autoEnter across editing and sorting, preserving it when an old client omits it', async () => {
    const [first] = await updateTerminalCommand({ action: 'create', value: { ...value, autoEnter: false } });
    await updateTerminalCommand({ action: 'edit', id: first.id, value: { ...value, name: '新名称' } });
    const [, second] = await updateTerminalCommand({ action: 'create', value });
    await updateTerminalCommand({ action: 'reorder', ids: [second.id, first.id] });
    expect((await getTerminalCommands())[1].autoEnter).toBe(false);
    await updateTerminalCommand({ action: 'edit', id: first.id, value: { ...value, autoEnter: true } });
    expect((await getTerminalCommands())[1].autoEnter).toBe(true);
  });

  it('persists key order and visibility without losing concurrent command and workspace changes', async () => {
    expect(await getTerminalKeys()).toEqual(DEFAULT_TERMINAL_KEYS);
    const keys = [...DEFAULT_TERMINAL_KEYS].reverse().map((key) => ({ ...key, visible: key.id !== 'ctrl' }));
    await Promise.all([
      updateTerminalKeys(keys),
      updateTerminalCommand({ action: 'create', value }),
      updateActive({ sidebarWidth: 333 }),
    ]);
    expect(await getTerminalKeys()).toEqual(keys);
    expect(await getTerminalCommands()).toHaveLength(1);
    expect(JSON.parse(mocks.files.get(file)!).sidebarWidth).toBe(333);
    await updateTerminalKeys(DEFAULT_TERMINAL_KEYS);
    expect(await getTerminalKeys()).toEqual(DEFAULT_TERMINAL_KEYS);
  });

  it('does not write or broadcast invalid keys, failed writes or corrupt reads', async () => {
    const before = mocks.files.get(file);
    await expect(updateTerminalKeys([])).rejects.toThrow();
    mocks.fail = true;
    await expect(updateTerminalKeys(DEFAULT_TERMINAL_KEYS)).rejects.toThrow('disk full');
    expect(mocks.files.get(file)).toBe(before);
    expect(mocks.broadcast).not.toHaveBeenCalled();
    mocks.fail = false;
    await updateTerminalKeys(DEFAULT_TERMINAL_KEYS.map((key) => ({ ...key, visible: false })));
    expect((await getTerminalKeys()).every((key) => !key.visible)).toBe(true);
    mocks.readFail = true;
    await expect(getTerminalKeys()).rejects.toThrow('Denied');
    await expect(updateTerminalKeys(DEFAULT_TERMINAL_KEYS)).rejects.toThrow('Denied');
    mocks.readFail = false;
    mocks.files.set(file, '{broken');
    await expect(updateTerminalKeys(DEFAULT_TERMINAL_KEYS)).rejects.toThrow();
    expect(mocks.files.get(file)).toBe('{broken');
  });
  it('persists order while preserving concurrent edits, metadata and subsequent CRUD positions', async () => {
    await updateTerminalCommand({ action: 'create', value });
    const [first, second] = await updateTerminalCommand({ action: 'create', value: { name: '目录', command: 'pwd' } });
    await Promise.all([
      updateTerminalCommand({ action: 'edit', id: first.id, value: { name: '更新状态', command: 'git status -sb' } }),
      updateTerminalCommand({ action: 'reorder', ids: [second.id, first.id] }),
      updateActive({ sidebarWidth: 300 }),
    ]);
    expect(await getTerminalCommands()).toEqual([second, { id: first.id, name: '更新状态', command: 'git status -sb' }]);
    expect(JSON.parse(mocks.files.get(file)!).sidebarWidth).toBe(300);
    const afterCreate = await updateTerminalCommand({ action: 'create', value });
    expect(afterCreate.map((command) => command.id)).toEqual([second.id, first.id, afterCreate[2].id]);
    await updateTerminalCommand({ action: 'delete', id: first.id });
    expect((await getTerminalCommands()).map((command) => command.id)).toEqual([second.id, afterCreate[2].id]);
  });

  it('rejects stale or duplicate ID sets without writing or broadcasting', async () => {
    await updateTerminalCommand({ action: 'create', value });
    const [first, second] = await updateTerminalCommand({ action: 'create', value });
    const before = mocks.files.get(file);
    mocks.broadcast.mockClear();
    for (const ids of [[], [first.id], [first.id, 'missing'], [first.id, first.id], [first.id, second.id, 'extra']]) {
      await expect(updateTerminalCommand({ action: 'reorder', ids })).rejects.toMatchObject({ status: 409 });
    }
    expect(mocks.files.get(file)).toBe(before);
    expect(mocks.broadcast).not.toHaveBeenCalled();
  });

  it('does not overwrite concurrent creations or resurrect deleted commands', async () => {
    const [first] = await updateTerminalCommand({ action: 'create', value });
    await updateTerminalCommand({ action: 'create', value });
    await expect(updateTerminalCommand({ action: 'reorder', ids: [first.id] })).rejects.toMatchObject({ status: 409 });
    const commands = await getTerminalCommands();
    await updateTerminalCommand({ action: 'delete', id: first.id });
    await expect(updateTerminalCommand({ action: 'reorder', ids: commands.map((command) => command.id) })).rejects.toMatchObject({ status: 409 });
    expect(await getTerminalCommands()).toEqual([commands[1]]);
  });

  it('retains persisted order on disk failure and broadcasts a successful retry', async () => {
    await updateTerminalCommand({ action: 'create', value });
    const [first, second] = await updateTerminalCommand({ action: 'create', value });
    mocks.broadcast.mockClear();
    mocks.fail = true;
    await expect(updateTerminalCommand({ action: 'reorder', ids: [second.id, first.id] })).rejects.toThrow('disk full');
    expect(await getTerminalCommands()).toEqual([first, second]);
    expect(mocks.broadcast).not.toHaveBeenCalled();
    mocks.fail = false;
    await updateTerminalCommand({ action: 'reorder', ids: [second.id, first.id] });
    expect(await getTerminalCommands()).toEqual([second, first]);
    expect(mocks.broadcast).toHaveBeenCalledTimes(1);
  });

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
