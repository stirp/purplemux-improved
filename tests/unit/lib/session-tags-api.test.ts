import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ update: vi.fn(), tabs: vi.fn(() => ({})) }));
vi.mock('@/lib/workspace-store', () => ({ updateSessionTags: mocks.update }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: mocks.tabs }) }));
import handler from '@/pages/api/session-tags';
import { SessionTagError } from '@/lib/session-tags';
const request = async (body: unknown, method = 'PATCH') => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, body } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => vi.clearAllMocks());
describe('session tags API', () => {
  const tag = { id: 'tag', name: '  Resident  ', color: 'purple' };
  it.each(['blue', 'teal', 'amber', 'green', 'red'])('accepts %s in create, update and assignment requests', async (color) => {
    const colored = { ...tag, color };
    for (const body of [
      { action: 'create', revision: 0, tag: colored },
      { action: 'update', revision: 0, tag: colored },
      { action: 'assign', revision: 0, key: 'codex:tab:t', tagIds: ['tag'], newTags: [colored] },
    ]) {
      expect((await request(body)).status).toHaveBeenCalledWith(200);
      const update = mocks.update.mock.lastCall![0];
      expect(update.tag?.color ?? update.newTags[0].color).toBe(color);
    }
  });
  it.each([
    { action: 'create', revision: 0, tag }, { action: 'update', revision: 0, tag },
    { action: 'delete', revision: 0, id: 'tag' }, { action: 'assign', revision: 0, key: 'codex:tab:t', tagIds: ['tag'], newTags: [tag] },
    { action: 'reorder', revision: 0, tagIds: ['second', 'tag'] },
  ])('accepts validated operations %j', async (body) => {
    expect((await request(body)).status).toHaveBeenCalledWith(200);
    const update = mocks.update.mock.calls[0][0];
    if (update.tag) expect(update.tag.name).toBe('Resident');
    expect(mocks.update.mock.calls[0][1]()).toEqual({});
  });
  it('rejects oversized input and unsupported methods', async () => {
    expect((await request({ action: 'create', revision: 0, tag: { ...tag, name: 'x'.repeat(25) } })).status).toHaveBeenCalledWith(400);
    expect((await request({}, 'POST')).status).toHaveBeenCalledWith(405);
    expect((await request({ action: 'reorder', revision: 0, tagIds: Array.from({ length: 501 }, (_, i) => `tag-${i}`) })).status).toHaveBeenCalledWith(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('returns safe error codes for conflicts and storage errors', async () => {
    mocks.update.mockRejectedValueOnce(new SessionTagError('conflict'));
    const conflict = await request({ action: 'delete', revision: 0, id: 'tag' });
    expect(conflict.status).toHaveBeenCalledWith(409);
    expect(conflict.json).toHaveBeenCalledWith({ code: 'conflict' });
    mocks.update.mockRejectedValueOnce(new Error('/private/path disk full'));
    const failure = await request({ action: 'delete', revision: 0, id: 'tag' });
    expect(failure.status).toHaveBeenCalledWith(500);
    expect(failure.json).toHaveBeenCalledWith({ code: 'saveFailed' });
  });
});
