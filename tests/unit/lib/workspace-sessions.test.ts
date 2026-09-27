import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ITab } from '@/types/terminal';
const mocks = vi.hoisted(() => ({
  root: '', statuses: {} as Record<string, unknown>, history: [] as Record<string, unknown>[],
  panes: vi.fn(), remove: vi.fn(), hide: vi.fn(), broadcast: vi.fn(), forget: vi.fn(),
}));
vi.mock('@/lib/tmux', () => ({ getAllPanesInfo: mocks.panes }));
vi.mock('@/lib/layout-store', () => ({ resolveLayoutDir: (id: string) => path.join(mocks.root, id) }));
vi.mock('@/lib/delete-session', () => ({ deleteOriginalSession: mocks.remove }));
vi.mock('@/lib/hidden-sessions', () => ({ hideSession: mocks.hide, sessionHistoryKey: (provider: string, id: string) => `${provider}:${id}` }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({
  getAllForClient: () => mocks.statuses, broadcast: mocks.broadcast, removeWorkspaceTabs: mocks.forget,
}) }));
vi.mock('@/lib/session-history', () => ({
  getSessionHistory: async () => mocks.history,
  removeSessionHistory: async (provider: string, sessionId: string | null, id?: string) => {
    mocks.history = mocks.history.filter((e) => e.providerId !== provider || (sessionId ? e.agentSessionId !== sessionId : e.id !== id));
  },
}));
import { collectWorkspaceSessions, deleteWorkspaceSessions } from '@/lib/workspace-sessions';
const tab = (id: string, providerId = 'codex'): ITab => ({
  id, name: id, order: 0, sessionName: `pt-ws-one-${id}`, agentState: { providerId, sessionId: id, jsonlPath: null, summary: null },
});
beforeEach(async () => {
  vi.resetAllMocks();
  mocks.root = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-session-delete-'));
  mocks.statuses = {};
  mocks.history = [];
  mocks.panes.mockResolvedValue(new Map());
});
afterEach(async () => { await fs.rm(mocks.root, { recursive: true, force: true }); });

describe('workspace native session cleanup', () => {
  it('collects and deduplicates layout, legacy, runtime and historical IDs by provider and workspace', async () => {
    mocks.statuses = {
      own: { workspaceId: 'ws-one', agentProviderId: 'codex', agentSessionId: 'runtime' },
      other: { workspaceId: 'ws-other', agentProviderId: 'codex', agentSessionId: 'unrelated' },
    };
    mocks.history = [
      { workspaceId: 'ws-one', providerId: 'codex', agentSessionId: 'same' },
      { workspaceId: 'ws-one', providerId: 'claude', agentSessionId: 'old' },
      { workspaceId: 'ws-other', providerId: 'claude', agentSessionId: 'unrelated' },
    ];
    expect(await collectWorkspaceSessions('ws-one', [tab('same'), tab('same', 'claude'), { ...tab('legacy'), agentState: undefined, claudeSessionId: 'legacy' }])).toEqual([
      { provider: 'codex', sessionId: 'same' }, { provider: 'claude', sessionId: 'same' },
      { provider: 'claude', sessionId: 'legacy' }, { provider: 'codex', sessionId: 'runtime' },
      { provider: 'claude', sessionId: 'old' },
    ]);
  });
  it('deletes native sessions and their history, keeping unrelated and unidentified foreign history', async () => {
    mocks.history = [
      { id: 'a', workspaceId: 'ws-one', providerId: 'codex', agentSessionId: 'one' },
      { id: 'b', workspaceId: 'ws-one', providerId: 'claude', agentSessionId: null },
      { id: 'c', workspaceId: 'ws-other', providerId: 'claude', agentSessionId: null },
    ];
    const sessions = await collectWorkspaceSessions('ws-one', [tab('two', 'claude')]);
    await deleteWorkspaceSessions('ws-one', sessions);
    expect(mocks.remove.mock.calls).toEqual([['claude', 'two', 'ws-one'], ['codex', 'one', 'ws-one']]);
    expect(mocks.hide).toHaveBeenCalledTimes(2);
    expect(mocks.history.map((e) => e.id)).toEqual(['c']);
    expect(mocks.forget).toHaveBeenCalledWith('ws-one', false);
    expect(mocks.broadcast).toHaveBeenCalledWith({ type: 'session-history:sync', entries: mocks.history });
  });
  it('preserves runtime-only IDs for retry and never repeats an acknowledged native deletion', async () => {
    mocks.statuses = { own: { workspaceId: 'ws-one', agentProviderId: 'codex', agentSessionId: 'two' } };
    const sessions = await collectWorkspaceSessions('ws-one', [tab('one')]);
    mocks.remove.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('native refused'));
    await expect(deleteWorkspaceSessions('ws-one', sessions)).rejects.toThrow('native refused');
    mocks.statuses = {};
    const retry = await collectWorkspaceSessions('ws-one', []);
    expect(retry).toEqual(sessions);
    await deleteWorkspaceSessions('ws-one', retry);
    expect(mocks.remove.mock.calls.map((call) => call[1])).toEqual(['one', 'two', 'two']);
  });
  it('refuses deletion if a workspace terminal reappears during cleanup', async () => {
    const sessions = await collectWorkspaceSessions('ws-one', [tab('one')]);
    mocks.panes.mockResolvedValue(new Map([['pt-ws-one-new-tab', {}]]));
    await expect(deleteWorkspaceSessions('ws-one', sessions)).rejects.toThrow('still running');
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('keeps history visible if native deletion fails', async () => {
    mocks.history = [{ workspaceId: 'ws-one', providerId: 'codex', agentSessionId: 'one' }];
    const sessions = await collectWorkspaceSessions('ws-one', []);
    mocks.remove.mockRejectedValue(new Error('active'));
    await expect(deleteWorkspaceSessions('ws-one', sessions)).rejects.toThrow('active');
    expect(mocks.hide).not.toHaveBeenCalled();
    expect(mocks.history).toHaveLength(1);
  });
});
