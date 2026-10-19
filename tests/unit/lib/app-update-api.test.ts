import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAppUpdateManager } from '@/lib/app-update-manager';
const mocks = vi.hoisted(() => ({ check: vi.fn(), install: vi.fn(), getState: vi.fn(() => ({ phase: 'idle' })), guard: vi.fn(), getManager: vi.fn() }));
vi.mock('@/lib/app-update-server', () => ({ getAppUpdateManager: mocks.getManager }));
vi.mock('@/lib/app-update-guard', () => ({ assertUpdateSessionsIdle: mocks.guard }));
import handler from '@/pages/api/app-update';

const call = async (method: string, action?: string, headers = {}) => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, headers, body: { action } } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getManager.mockReturnValue(mocks);
});

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
  it('returns a busy snapshot while the real manager is checking session safety', async () => {
    let rejectIdle!: (error: Error) => void;
    const idle = new Promise<void>((_resolve, reject) => { rejectIdle = reject; });
    const download = vi.fn(async () => '/staged');
    const manager = createAppUpdateManager({
      currentVersion: '0.5.6', supported: true, latest: async () => '0.6.0',
      assertIdle: () => idle, download, restart: vi.fn(async () => {}),
    });
    await manager.check();
    mocks.getManager.mockReturnValue(manager);
    const res = await call('POST', 'install', { 'x-purplemux-update': '1', 'content-type': 'application/json' });
    const installation = manager.install();
    rejectIdle(new Error('busy'));
    await installation;
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ phase: 'checking' }));
    expect(manager.getState().phase).toBe('blocked');
    expect(download).not.toHaveBeenCalled();
  });
});
