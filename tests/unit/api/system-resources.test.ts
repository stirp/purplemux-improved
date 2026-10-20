import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it, vi } from 'vitest';
import handler from '@/pages/api/system/resources';
import { getSystemResources } from '@/lib/system-resources';

vi.mock('@/lib/system-resources', () => ({ getSystemResources: vi.fn() }));
const response = () => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
describe('GET /api/system/resources', () => {
  it('returns uncached server resources', async () => {
    const data = { sampledAt: 1000, cpu: 50, memory: { used: 4, total: 8, available: 4, basis: 'available' as const } };
    vi.mocked(getSystemResources).mockResolvedValueOnce(data);
    const res = response();
    await handler({ method: 'GET' } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(data);
  });
  it('rejects writes before sampling', async () => {
    vi.mocked(getSystemResources).mockClear();
    const res = response();
    await handler({ method: 'POST' } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET');
    expect(getSystemResources).not.toHaveBeenCalled();
  });
  it('returns 503 without exposing host errors', async () => {
    vi.mocked(getSystemResources).mockRejectedValueOnce(new Error('private host detail'));
    const res = response();
    await handler({ method: 'GET' } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'System resources unavailable' });
  });
});
