import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { createAppUpdateManager } from '@/lib/app-update-manager';
const mocks = vi.hoisted(() => ({ check: vi.fn(), install: vi.fn(), skip: vi.fn(), saveDesktop: vi.fn(), getState: vi.fn(() => ({ phase: 'idle' })), guard: vi.fn(), getManager: vi.fn() }));
vi.mock('@/lib/app-update-server', () => ({ getAppUpdateManager: mocks.getManager }));
vi.mock('@/lib/app-update-guard', () => ({ assertUpdateSessionsIdle: mocks.guard }));
vi.mock('@/lib/workspace-store', () => ({ saveSkippedAppVersion: mocks.saveDesktop }));
import handler from '@/pages/api/app-update';

const call = async (method: string, action?: string, headers = {}, version?: unknown) => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, headers, body: { action, version } } as NextApiRequest, res as unknown as NextApiResponse);
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
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ phase: 'checking', installing: true }));
    expect(manager.getState().phase).toBe('blocked');
    expect(download).not.toHaveBeenCalled();
  });
  it('requires a valid version for force and skip and retains the write-request guard', async () => {
    const headers = { 'x-purplemux-update': '1', 'content-type': 'application/json' };
    for (const action of ['force-install', 'skip', 'skip-desktop-version']) {
      expect((await call('POST', action, {}, '0.6.0')).status).toHaveBeenCalledWith(400);
      for (const version of [undefined, {}, 'invalid']) {
        expect((await call('POST', action, headers, version)).status).toHaveBeenCalledWith(400);
      }
    }
    expect(mocks.install).not.toHaveBeenCalled();
    expect(mocks.skip).not.toHaveBeenCalled();
    expect((await call('POST', 'force-install', headers, '0.6.0')).status).toHaveBeenCalledWith(202);
    expect(mocks.install).toHaveBeenCalledExactlyOnceWith({ force: true, version: '0.6.0' });
    expect((await call('POST', 'skip', headers, '0.6.0')).status).toHaveBeenCalledWith(202);
    expect(mocks.skip).toHaveBeenCalledExactlyOnceWith('0.6.0');
  });
  it('reports skip persistence failures rather than accepting the request', async () => {
    mocks.skip.mockRejectedValueOnce(new Error('disk full'));
    const res = await call('POST', 'skip', { 'x-purplemux-update': '1', 'content-type': 'application/json' }, '0.6.0');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'disk full' });
  });
  it('saves the desktop preference without skipping the server release or installing', async () => {
    const res = await call('POST', 'skip-desktop-version', { 'x-purplemux-update': '1', 'content-type': 'application/json' }, '0.7.0');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(mocks.saveDesktop).toHaveBeenCalledExactlyOnceWith('desktop', '0.7.0');
    expect(mocks.skip).not.toHaveBeenCalled();
    expect(mocks.install).not.toHaveBeenCalled();
  });

});
