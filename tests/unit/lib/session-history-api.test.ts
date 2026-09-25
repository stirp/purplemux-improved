import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({
  hide: vi.fn(async () => {}),
  deleteOriginal: vi.fn(async () => {}),
  hidden: new Set<string>(),
  remove: vi.fn(async () => []),
  broadcast: vi.fn(),
}));
vi.mock('@/lib/hidden-sessions', () => ({ hideSession: mocks.hide, readHiddenSessions: async () => mocks.hidden, sessionHistoryKey: (provider: string, id: string) => `${provider}:${id}` }));
vi.mock('@/lib/delete-session', () => ({ deleteOriginalSession: mocks.deleteOriginal, SessionInUseError: class SessionInUseError extends Error {} }));
vi.mock('@/lib/session-history', () => ({ removeSessionHistory: mocks.remove }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ broadcast: mocks.broadcast }) }));
vi.mock('@/lib/tmux', () => ({ hasSession: async () => true }));
vi.mock('@/lib/session-list', () => ({ listSessions: async () => ['one', 'two', 'three'].map((sessionId) => ({ sessionId })) }));
vi.mock('@/lib/codex-session-list', () => ({ listCodexSessions: async () => ({ sessions: [{ sessionId: 'one' }, { sessionId: 'two' }], scannedDirs: 1, scannedFiles: 2 }) }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
import removeHandler from '@/pages/api/session-history';
import claudeHandler from '@/pages/api/timeline/sessions';
import codexHandler from '@/pages/api/codex/sessions';
import { SessionInUseError } from '@/lib/delete-session';

const response = () => {
  const res = { status: vi.fn(), json: vi.fn(), end: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
beforeEach(() => { mocks.hidden.clear(); vi.clearAllMocks(); });

describe('history management API', () => {
  it('removes only the selected provider/session after a DELETE request', async () => {
    const res = response();
    await removeHandler({ method: 'DELETE', body: { provider: 'codex', sessionId: 'session-1' } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.hide).toHaveBeenCalledExactlyOnceWith('codex', 'session-1');
    expect(mocks.remove).toHaveBeenCalledWith('codex', 'session-1', undefined);
    expect(mocks.broadcast).toHaveBeenCalledWith({ type: 'session-history:sync', entries: [] });
    expect(mocks.deleteOriginal).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });
  it('only deletes original tool records with the explicit option', async () => {
    const res = response();
    await removeHandler({ method: 'DELETE', body: { provider: 'codex', sessionId: 'session-1', deleteOriginal: true } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.deleteOriginal).toHaveBeenCalledExactlyOnceWith('codex', 'session-1');
    expect(res.status).toHaveBeenCalledWith(204);
  });
  it('does not hide an active session after deletion is refused', async () => {
    mocks.deleteOriginal.mockRejectedValueOnce(new SessionInUseError());
    const res = response();
    await removeHandler({ method: 'DELETE', body: { provider: 'codex', sessionId: 'session-1', deleteOriginal: true } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mocks.hide).not.toHaveBeenCalled();
  });
  it('rejects malformed session identifiers', async () => {
    const res = response();
    await removeHandler({ method: 'DELETE', body: { provider: 'claude', sessionId: '../other' } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.hide).not.toHaveBeenCalled();
  });
  it('removes a legacy global entry without a native session ID', async () => {
    const res = response();
    await removeHandler({ method: 'DELETE', body: { provider: 'claude', sessionId: null, historyEntryId: 'entry-1' } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.remove).toHaveBeenCalledWith('claude', null, 'entry-1');
    expect(mocks.hide).not.toHaveBeenCalled();
    expect(mocks.deleteOriginal).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(204);
  });
  it('rejects original deletion without a native session ID', async () => {
    const res = response();
    await removeHandler({ method: 'DELETE', body: { provider: 'claude', sessionId: null, historyEntryId: 'entry-1', deleteOriginal: true } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
  it('filters Claude history before pagination and counts', async () => {
    mocks.hidden.add('claude:one');
    const res = response();
    await claudeHandler({ method: 'GET', query: { tmuxSession: 'session', limit: '1' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.json).toHaveBeenCalledWith({ sessions: [{ sessionId: 'two' }], total: 2, hasMore: true });
  });
  it('filters Codex history without hiding same-id Claude sessions', async () => {
    mocks.hidden.add('codex:one');
    const res = response();
    await codexHandler({ method: 'GET', query: { cwd: '/project' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.json).toHaveBeenCalledWith({ sessions: [{ sessionId: 'two' }], scannedDirs: 1, scannedFiles: 2 });
    const claude = response();
    await claudeHandler({ method: 'GET', query: { tmuxSession: 'session' } } as unknown as NextApiRequest, claude as unknown as NextApiResponse);
    expect(claude.json.mock.calls[0][0].total).toBe(3);
  });
});
