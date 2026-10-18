import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TERMINAL_KEYS, normalizeTerminalKeys } from '@/lib/terminal-keys';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getTerminalKeys: mocks.get, updateTerminalKeys: mocks.update }));
import handler from '@/pages/api/terminal-keys';

const request = async (method: string, body?: unknown) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
  await handler({ method, body } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.get.mockResolvedValue(DEFAULT_TERMINAL_KEYS);
  mocks.update.mockImplementation(async (keys) => keys);
});

describe('terminal key configuration', () => {
  it('loads and saves the full ordered configuration including all-hidden', async () => {
    expect((await request('GET')).json).toHaveBeenCalledWith(DEFAULT_TERMINAL_KEYS);
    const keys = [...DEFAULT_TERMINAL_KEYS].reverse().map((key) => ({ ...key, visible: false }));
    const res = await request('PUT', { keys });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(keys);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(keys);
  });

  it.each([
    null, {}, { keys: [] }, { keys: 'tab' }, { keys: DEFAULT_TERMINAL_KEYS.slice(1) },
    { keys: [...DEFAULT_TERMINAL_KEYS, DEFAULT_TERMINAL_KEYS[0]] },
    { keys: DEFAULT_TERMINAL_KEYS.map((key) => ({ ...key, id: 'tab' })) },
    { keys: DEFAULT_TERMINAL_KEYS.map((key) => ({ ...key, visible: 'false' })) },
    { keys: DEFAULT_TERMINAL_KEYS.map((key) => ({ ...key, id: 'injected' })) },
  ])('rejects invalid configuration %j', async (body) => {
    expect((await request('PUT', body)).status).toHaveBeenCalledWith(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('reports failures without leaking file paths and rejects other methods', async () => {
    mocks.get.mockRejectedValue(new Error('/private/path'));
    mocks.update.mockRejectedValue(new Error('/private/path'));
    for (const method of ['GET', 'PUT']) {
      const res = await request(method, { keys: DEFAULT_TERMINAL_KEYS });
      expect(res.status).toHaveBeenCalledWith(500);
      expect(JSON.stringify(res.json.mock.calls)).not.toContain('/private/path');
    }
    const res = await request('POST');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, PUT');
  });

  it('normalizes old and partial settings while preserving known order and hidden state', () => {
    expect(normalizeTerminalKeys(undefined)).toEqual(DEFAULT_TERMINAL_KEYS);
    expect(normalizeTerminalKeys(null)).toEqual(DEFAULT_TERMINAL_KEYS);
    const keys = normalizeTerminalKeys([
      { id: 'f12', visible: false }, { id: 'tab', visible: true }, { id: 'f12', visible: true },
      { id: 'unknown', visible: true }, null, { id: 'esc', visible: 'false' },
    ]);
    expect(keys.slice(0, 2)).toEqual([{ id: 'f12', visible: false }, { id: 'tab', visible: true }]);
    expect(keys).toHaveLength(23);
    expect(new Set(keys.map(({ id }) => id)).size).toBe(23);
    expect(keys.find(({ id }) => id === 'esc')?.visible).toBe(true);
  });
});
