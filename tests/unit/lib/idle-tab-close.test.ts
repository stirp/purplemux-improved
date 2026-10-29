import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ files: new Map<string, string>(), kill: vi.fn(), broadcast: vi.fn() }));
vi.mock('os', () => ({ default: { homedir: () => '/idle-close-test' } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: async (file: string) => {
    if (!m.files.has(file)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
    return m.files.get(file)!;
  },
  mkdir: async () => {},
  writeFile: async (file: string, content: string) => { m.files.set(file, content); },
  rename: async (from: string, to: string) => { m.files.set(to, m.files.get(from)!); m.files.delete(from); },
  unlink: async () => {},
} }));
vi.mock('@/lib/tmux', () => ({ killSession: m.kill }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: m.broadcast }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/workspace-store', () => ({ updateWorkspaceDirectories: vi.fn() }));
import { removeTabFromPane, resolveLayoutFile } from '@/lib/layout-store';

const file = resolveLayoutFile('ws-idle');
const tab = { id: 'tab', name: 'Codex', sessionName: 'terminal', panelType: 'codex-cli', order: 0 };
const layout = { root: { id: 'pane', type: 'pane', activeTabId: 'tab', tabs: [tab] }, activePaneId: 'pane' };
const stored = () => JSON.parse(m.files.get(file)!);
beforeEach(() => {
  vi.resetAllMocks(); m.files.clear();
  (globalThis as { __ptLayoutContentCache?: Map<string, string> }).__ptLayoutContentCache?.clear();
  m.files.set(file, JSON.stringify(layout));
  m.kill.mockImplementation(async (_name, beforeSignal) => { await beforeSignal?.(); });
});
describe('guarded idle tab close', () => {
  it('keeps the last empty pane and broadcasts layout only after confirmed shutdown', async () => {
    const beforeClose = vi.fn(async () => {});
    const afterClose = vi.fn(async () => { expect(stored().root.tabs).toHaveLength(1); });
    expect(await removeTabFromPane('ws-idle', 'pane', 'tab', { beforeClose, afterClose })).toBe(true);
    expect(beforeClose).toHaveBeenCalledWith({
      ...tab,
      agentState: { providerId: 'codex', sessionId: null, jsonlPath: null, summary: null },
    });
    expect(afterClose).toHaveBeenCalledOnce();
    expect(stored().root).toMatchObject({ tabs: [], activeTabId: null });
    expect(m.broadcast).toHaveBeenCalledWith({ type: 'layout', workspaceId: 'ws-idle' });
  });
  it('keeps the layout if validation or shutdown verification fails', async () => {
    const beforeClose = vi.fn(async (): Promise<void> => { throw new Error('new input'); });
    const afterClose = vi.fn(async () => {});
    await expect(removeTabFromPane('ws-idle', 'pane', 'tab', { beforeClose, afterClose })).rejects.toThrow('new input');
    expect(afterClose).not.toHaveBeenCalled();
    expect(stored().root.tabs).toHaveLength(1);
    beforeClose.mockResolvedValue(undefined);
    afterClose.mockRejectedValue(new Error('still alive'));
    await expect(removeTabFromPane('ws-idle', 'pane', 'tab', { beforeClose, afterClose })).rejects.toThrow('still alive');
    expect(stored().root.tabs).toHaveLength(1);
    expect(m.broadcast).not.toHaveBeenCalled();
  });
  it('does not remove a tab whose identity changed while closing', async () => {
    const beforeClose = async () => {};
    const afterClose = async () => {
      m.files.set(file, JSON.stringify({ ...layout, root: { ...layout.root, tabs: [{ ...tab, sessionName: 'new' }] } }));
    };
    await expect(removeTabFromPane('ws-idle', 'pane', 'tab', { beforeClose, afterClose })).rejects.toThrow('changed');
    expect(stored().root.tabs[0].sessionName).toBe('new');
  });
});
