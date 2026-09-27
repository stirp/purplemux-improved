import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({
  verifySession: vi.fn(), verifyCli: vi.fn(), resolvePath: vi.fn(),
  stat: vi.fn(), readStream: vi.fn(), pipeline: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ verifyRequestSession: mocks.verifySession }));
vi.mock('@/lib/cli-token', () => ({ verifyCliToken: mocks.verifyCli }));
vi.mock('@/lib/uploads-store', () => ({
  resolveUploadImagePath: mocks.resolvePath, getImageMimeForPath: () => 'image/png',
}));
vi.mock('fs', () => ({ createReadStream: mocks.readStream }));
vi.mock('fs/promises', () => ({ stat: mocks.stat }));
vi.mock('stream/promises', () => ({ pipeline: mocks.pipeline }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
import handler from '@/pages/api/uploads/[...path]';

const call = async (headers = {}) => {
  const req = { method: 'GET', headers, query: { path: ['ws-one', 'tab-one', 'private.png'] } };
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  await handler(req as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.verifySession.mockResolvedValue(false);
  mocks.verifyCli.mockReturnValue(false);
  mocks.resolvePath.mockReturnValue('/uploads/ws-one/tab-one/private.png');
  mocks.stat.mockResolvedValue({ isFile: () => true, size: 123 });
});

describe('uploaded image authentication', () => {
  it.each([{}, { cookie: 'session-token=expired' }, { 'x-pmux-token': 'invalid' }])(
    'rejects unauthenticated requests before accessing the attachment: %j', async (headers) => {
      const res = await call(headers);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized' });
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
      expect(mocks.resolvePath).not.toHaveBeenCalled();
      expect(mocks.stat).not.toHaveBeenCalled();
      expect(mocks.readStream).not.toHaveBeenCalled();
      expect(mocks.pipeline).not.toHaveBeenCalled();
    },
  );

  it('serves the image for a verified browser session', async () => {
    mocks.verifySession.mockResolvedValue(true);
    const res = await call({ cookie: 'session-token=valid' });
    expect(mocks.verifySession).toHaveBeenCalledWith('session-token=valid');
    expect(mocks.readStream).toHaveBeenCalledWith('/uploads/ws-one/tab-one/private.png');
    expect(mocks.pipeline).toHaveBeenCalledOnce();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
  });

  it('preserves authenticated CLI access without requiring a browser cookie', async () => {
    mocks.verifyCli.mockReturnValue(true);
    await call({ 'x-pmux-token': 'valid' });
    expect(mocks.verifySession).not.toHaveBeenCalled();
    expect(mocks.pipeline).toHaveBeenCalledOnce();
  });

  it('still rejects unsafe paths after authentication', async () => {
    mocks.verifySession.mockResolvedValue(true);
    mocks.resolvePath.mockReturnValue(null);
    expect((await call()).status).toHaveBeenCalledWith(403);
    expect(mocks.stat).not.toHaveBeenCalled();
  });
});
