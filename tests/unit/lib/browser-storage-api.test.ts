import { describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/browser-storage';

const call = (method: string, headers = {}) => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  handler({ method, headers } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
describe('browser storage API', () => {
  it('requests HTTP cache eviction only for an explicit confirmed POST', () => {
    const res = call('POST', { 'x-purplemux-clear-storage': '1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader.mock.calls).toEqual([['Cache-Control', 'no-store'], ['Clear-Site-Data', '"cache"']]);
  });
  it('does not clear data for GET requests or cross-origin form submissions', () => {
    for (const method of ['GET', 'POST']) {
      const res = call(method);
      expect(res.status).toHaveBeenCalledWith(method === 'GET' ? 405 : 400);
      expect(res.setHeader).not.toHaveBeenCalledWith('Clear-Site-Data', expect.anything());
    }
  });
});
