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
  it.each(['POST', 'PATCH'])('accepts proxied same-origin %s requests', async (method) => {
    for (const headers of [
      { host: '127.0.0.1:8022', origin: 'https://pmux.example.test', 'sec-fetch-site': 'same-origin' },
      { host: '127.0.0.1:8022', origin: 'http://pmux.example.test', 'x-purplemux-process-action': '1' },
    ]) {
      expect((await call(method, method === 'POST' ? body : policy, headers)).status).toHaveBeenCalledWith(200);
      if (method === 'POST') expect(m.reclaim).toHaveBeenLastCalledWith([target], policy);
      else expect(m.save).toHaveBeenLastCalledWith(policy);
    }
  });
  it.each(['POST', 'PATCH'])('rejects unsafe %s requests before mutation', async (method) => {
    for (const headers of [
      { 'sec-fetch-site': 'cross-site', 'x-purplemux-process-action': '1' },
      { 'sec-fetch-site': 'same-site', 'x-purplemux-process-action': '1' },
      { origin: 'null' },
      { origin: 'not a URL' },
    ]) {
      expect((await call(method, method === 'POST' ? body : policy, headers)).status).toHaveBeenCalledWith(403);
    }
    expect(m.reclaim).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
  it('does not enable CORS preflight for custom headers', async () => {
    const res = await call('OPTIONS', undefined, { origin: 'https://evil.test', 'access-control-request-headers': 'x-purplemux-process-action' });
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader.mock.calls.some(([name]) => String(name).toLowerCase().startsWith('access-control-'))).toBe(false);
    expect(m.reclaim).not.toHaveBeenCalled();
    expect(m.save).not.toHaveBeenCalled();
  });
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
