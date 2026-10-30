import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({ exists: vi.fn(), list: vi.fn() }));
vi.mock('@/lib/tmux', () => ({ hasSession: mocks.exists }));
vi.mock('@/lib/session-list', () => ({ listSessions: mocks.list }));
vi.mock('@/lib/hidden-sessions', () => ({
  readHiddenSessions: async () => new Set(['claude:hidden']),
  sessionHistoryKey: (provider: string, id: string) => `${provider}:${id}`,
}));
import handler from '@/pages/api/timeline/sessions';

const request = async (query: Record<string, unknown>) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
  await handler({ method: 'GET', query } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.exists.mockResolvedValue(false);
  mocks.list.mockResolvedValue([{ sessionId: 'hidden' }, { sessionId: 'saved' }]);
});
describe('session queries without a live terminal', () => {
  it('returns a large complete list with one scan while filtering hidden sessions', async () => {
    const visible = Array.from({ length: 10000 }, (_, index) => ({ sessionId: `session-${index}` }));
    mocks.list.mockResolvedValue([{ sessionId: 'hidden' }, ...visible]);
    const res = await request({ cwd: '/repo', all: 'true', limit: '1', offset: '4' });
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith('', '/repo');
    expect(res.json).toHaveBeenCalledWith({ sessions: visible, total: 10000, hasMore: false });
  });
  it.each([undefined, 'false'])('preserves pagination unless all=true, all=%s', async (all) => {
    mocks.list.mockResolvedValue([{ sessionId: 'hidden' }, { sessionId: 'first' },
      { sessionId: 'second' }, { sessionId: 'third' }]);
    const res = await request({ cwd: '/repo', all, limit: '1', offset: '1' });
    expect(res.json).toHaveBeenCalledWith({ sessions: [{ sessionId: 'second' }], total: 3, hasMore: true });
  });
  it('loads by directory after all tabs have been reclaimed and still filters hidden history', async () => {
    const res = await request({ cwd: '/repo', limit: '1' });
    expect(mocks.exists).not.toHaveBeenCalled();
    expect(mocks.list).toHaveBeenCalledExactlyOnceWith('', '/repo');
    expect(res.json).toHaveBeenCalledWith({ sessions: [{ sessionId: 'saved' }], total: 1, hasMore: false });
  });
  it('keeps the existing 404 when only an expired terminal is supplied', async () => {
    expect((await request({ tmuxSession: 'expired' })).status).toHaveBeenCalledWith(404);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it('rejects missing or array-valued directory arguments', async () => {
    expect((await request({})).status).toHaveBeenCalledWith(400);
    expect((await request({ cwd: ['/repo'] })).status).toHaveBeenCalledWith(400);
  });
});
