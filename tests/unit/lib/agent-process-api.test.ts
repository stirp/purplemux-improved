import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ scan: vi.fn(), manage: vi.fn() }));
vi.mock('@/lib/local-agent-processes', () => ({ scanLocalAgentProcesses: mocks.scan }));
vi.mock('@/lib/agent-process-manager', () => ({ manageAgentProcess: mocks.manage }));
import handler from '@/pages/api/system/agent-processes';
const body = { action: 'adopt', pid: 123, startedAt: '2026-10-19T10:00:00.000Z', confirmed: true };
const call = async (method: string, input: unknown = body, headers = {}) => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, body: input, headers } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => { vi.resetAllMocks(); mocks.scan.mockResolvedValue({ processes: [], transfers: [] }); });
describe('process API', () => {
  it.each(['stop', 'adopt'])('accepts proxied same-origin %s requests', async (action) => {
    for (const headers of [
      { host: '127.0.0.1:8022', origin: 'https://pmux.example.test', 'sec-fetch-site': 'same-origin' },
      { host: '127.0.0.1:8022', origin: 'http://pmux.example.test', 'x-purplemux-process-action': '1' },
      { host: 'localhost:8022', origin: 'http://localhost:8022' },
      {},
    ]) {
      const input = { ...body, action };
      expect((await call('POST', input, headers)).status).toHaveBeenCalledWith(200);
      expect(mocks.manage).toHaveBeenLastCalledWith(action, input);
    }
  });
  it.each([
    { 'sec-fetch-site': 'cross-site', 'x-purplemux-process-action': '1' },
    { 'sec-fetch-site': 'same-site', 'x-purplemux-process-action': '1' },
    { origin: 'null' },
    { origin: 'not a URL' },
    { origin: 'https://evil.test', host: 'localhost', 'x-forwarded-host': 'evil.test' },
  ])('rejects unsafe origins without executing actions: %j', async (headers) => {
    expect((await call('POST', body, headers)).status).toHaveBeenCalledWith(403);
    expect(mocks.manage).not.toHaveBeenCalled();
  });
  it('does not enable CORS preflight for custom headers', async () => {
    const res = await call('OPTIONS', undefined, { origin: 'https://evil.test', 'access-control-request-headers': 'x-purplemux-process-action' });
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader.mock.calls.some(([name]) => String(name).toLowerCase().startsWith('access-control-'))).toBe(false);
    expect(mocks.manage).not.toHaveBeenCalled();
  });
  it('lists without caching and rejects unsupported methods', async () => {
    expect((await call('GET')).setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect((await call('DELETE')).status).toHaveBeenCalledWith(405);
  });
  it.each([{ ...body, confirmed: false }, { ...body, pid: -1 }, { ...body, startedAt: '' }, { ...body, command: 'evil' }])('rejects invalid/unconfirmed requests: %j', async (input) => {
    expect((await call('POST', input)).status).toHaveBeenCalledWith(400);
    expect(mocks.manage).not.toHaveBeenCalled();
  });
  it('blocks cross-site writes and propagates conflicts', async () => {
    expect((await call('POST', body, { 'sec-fetch-site': 'cross-site' })).status).toHaveBeenCalledWith(403);
    expect((await call('POST', body, { origin: 'https://evil.test', host: 'localhost' })).status).toHaveBeenCalledWith(403);
    expect(mocks.manage).not.toHaveBeenCalled();
    mocks.manage.mockRejectedValue(Object.assign(new Error('stale identity'), { status: 409 }));
    expect((await call('POST')).status).toHaveBeenCalledWith(409);
  });
});
