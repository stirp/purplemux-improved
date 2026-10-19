import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ check: vi.fn(), install: vi.fn(), getState: vi.fn(() => ({ phase: 'idle' })), guard: vi.fn() }));
vi.mock('@/lib/app-update-server', () => ({ getAppUpdateManager: () => mocks }));
vi.mock('@/lib/app-update-guard', () => ({ assertUpdateSessionsIdle: mocks.guard }));
import handler from '@/pages/api/app-update';

const call = async (method: string, action?: string, headers = {}) => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, headers, body: { action } } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => vi.clearAllMocks());

describe('update API', () => {
  it('GET is read-only and disables response caching', async () => {
    const res = await call('GET');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(mocks.check).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
  });
  it('rejects cross-origin forms and unknown actions', async () => {
    expect((await call('POST', 'install')).status).toHaveBeenCalledWith(400);
    expect((await call('POST', 'shell', { 'x-purplemux-update': '1', 'content-type': 'application/json' })).status).toHaveBeenCalledWith(400);
    expect(mocks.install).not.toHaveBeenCalled();
  });
  it('accepts explicit install and returns immediately', async () => {
    expect((await call('POST', 'install', { 'x-purplemux-update': '1', 'content-type': 'application/json' })).status).toHaveBeenCalledWith(202);
    expect(mocks.install).toHaveBeenCalledTimes(1);
  });
});
