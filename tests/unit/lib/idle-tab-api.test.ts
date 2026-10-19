import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const m = vi.hoisted(() => ({ preview: vi.fn(), reclaim: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/idle-tab-reclaimer', () => ({ previewIdleTabs: m.preview, reclaimIdleTabs: m.reclaim, updateIdleTabPolicy: m.save }));
import handler from '@/pages/api/system/idle-tabs';

const policy = { enabled: false, idleMinutes: 60 };
const target = { workspaceId: 'ws', paneId: 'pane', tabId: 'tab', sessionId: 'session', lastActivityAt: 1000 };
const body = { targets: [target], policy, confirmed: true };
const call = async (method: string, input: unknown = body, headers = {}) => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, body: input, headers } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => vi.resetAllMocks());
describe('idle tabs API', () => {
  it('provides a no-cache preview and only accepts supported methods', async () => {
    m.preview.mockResolvedValue({ policy, candidates: [] });
    const res = await call('GET');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).toHaveBeenCalledWith({ policy, candidates: [] });
    expect((await call('DELETE')).status).toHaveBeenCalledWith(405);
  });
  it.each([{}, { ...body, confirmed: false }, { ...body, targets: [] }, { ...body, targets: [{ ...target, lastActivityAt: 0 }] }, { ...body, command: 'evil' }])('rejects invalid reclamation: %j', async (input) => {
    expect((await call('POST', input)).status).toHaveBeenCalledWith(400);
    expect(m.reclaim).not.toHaveBeenCalled();
  });
  it.each([0, 14, 10081, 15.5, '60'])('rejects invalid timeout %s', async (idleMinutes) => {
    expect((await call('PATCH', { enabled: true, idleMinutes })).status).toHaveBeenCalledWith(400);
    expect(m.save).not.toHaveBeenCalled();
  });
  it('passes only explicit targets and policy to reclamation and reports partial results', async () => {
    const result = { reclaimed: [], skipped: [{ target, reason: 'Changed' }] };
    m.reclaim.mockResolvedValue(result);
    expect((await call('POST')).json).toHaveBeenCalledWith(result);
    expect(m.reclaim).toHaveBeenCalledWith([target], policy);
    expect((await call('PATCH', policy)).status).toHaveBeenCalledWith(200);
    expect(m.save).toHaveBeenCalledWith(policy);
  });
  it('blocks cross-site mutations and returns write errors', async () => {
    expect((await call('PATCH', policy, { 'sec-fetch-site': 'cross-site' })).status).toHaveBeenCalledWith(403);
    expect((await call('POST', body, { origin: 'https://other.test', host: 'localhost' })).status).toHaveBeenCalledWith(403);
    expect(m.save).not.toHaveBeenCalled();
    expect(m.reclaim).not.toHaveBeenCalled();
    m.save.mockRejectedValue(new Error('disk full'));
    expect((await call('PATCH', policy)).status).toHaveBeenCalledWith(500);
  });
});
