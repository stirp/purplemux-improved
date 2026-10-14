import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const update = vi.hoisted(() => vi.fn());
vi.mock('@/lib/workspace-store', () => ({ updateSessionWorkflow: update }));
import handler from '@/pages/api/session-workflow';

const request = async (body: unknown, method = 'PATCH') => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, body } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => vi.clearAllMocks());
describe('workflow API', () => {
  it('accepts a bounded session title', async () => {
    const res = await request({ key: 'claude:session-1', title: 'Renamed' });
    expect(update).toHaveBeenCalledWith({ key: 'claude:session-1', title: 'Renamed' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect((await request({ key: 'claude:session-1', title: 'x'.repeat(201) })).status).toHaveBeenCalledWith(400);
  });
  it('saves manual status and supports restoring automatic mode', async () => {
    for (const status of ['completed', null]) {
      const res = await request({ key: 'codex:s1', status });
      expect(update).toHaveBeenLastCalledWith({ key: 'codex:s1', status });
      expect(res.status).toHaveBeenCalledWith(200);
    }
  });
  it('updates a single collapsed section', async () => {
    await request({ section: 'review', collapsed: true });
    expect(update).toHaveBeenCalledWith({ section: 'review', collapsed: true });
  });
  it.each([
    { key: '__proto__', status: 'completed' }, { key: 'codex:s1', status: 'invalid' },
    { section: 'review', collapsed: 'true' }, { key: 'codex:s1', status: 'review', section: 'review' },
  ])('rejects malformed updates %j', async (body) => {
    expect((await request(body)).status).toHaveBeenCalledWith(400);
    expect(update).not.toHaveBeenCalled();
  });
  it('reports save failure', async () => {
    update.mockRejectedValueOnce(new Error('disk full'));
    expect((await request({ key: 'claude:s1', status: 'review' })).status).toHaveBeenCalledWith(500);
  });
  it('rejects unsupported methods', async () => {
    expect((await request({}, 'POST')).status).toHaveBeenCalledWith(405);
    expect(update).not.toHaveBeenCalled();
  });
});
