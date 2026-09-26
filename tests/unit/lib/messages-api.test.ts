import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ readFile: vi.fn(), getConfig: vi.fn() }));
vi.mock('fs/promises', () => ({ default: { readFile: mocks.readFile } }));
vi.mock('@/lib/config-store', () => ({ getConfig: mocks.getConfig }));
import handler from '@/pages/api/messages';
import { loadMessagesServer } from '@/lib/load-messages';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.readFile.mockResolvedValue('{"newKey":"current"}');
  mocks.getConfig.mockResolvedValue({ locale: 'zh-CN' });
});
describe('fresh translation catalogs', () => {
  it('rereads files on each request, including changes made since the previous load', async () => {
    expect((await loadMessagesServer('en')).settings).toEqual({ newKey: 'current' });
    mocks.readFile.mockResolvedValue('{"newKey":"updated"}');
    expect((await loadMessagesServer('en')).settings).toEqual({ newKey: 'updated' });
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });
  it('limits locale paths to the supported list and preserves the configured server locale', async () => {
    await loadMessagesServer('../../private');
    expect(mocks.readFile.mock.calls.every(([name]) => name.includes('/messages/en/'))).toBe(true);
    mocks.readFile.mockClear();
    await loadMessagesServer();
    expect(mocks.readFile.mock.calls.every(([name]) => name.includes('/messages/zh-CN/'))).toBe(true);
  });
  it('sends a non-cacheable catalog and validates method and locale input', async () => {
    const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    await handler({ method: 'GET', query: { locale: 'en' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenLastCalledWith(200);
    await handler({ method: 'GET', query: { locale: ['en', 'fr'] } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenLastCalledWith(400);
    await handler({ method: 'POST', query: {} } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenLastCalledWith(405);
  });
});
