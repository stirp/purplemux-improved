import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { terminalCommandInput } from '@/lib/terminal-custom-commands';

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getTerminalCommands: mocks.get, updateTerminalCommand: mocks.update }));
import handler from '@/pages/api/terminal-commands';

const request = async (method: string, body?: unknown) => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
  await handler({ method, body } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => { vi.resetAllMocks(); mocks.get.mockResolvedValue([]); mocks.update.mockResolvedValue([]); });

describe('terminal command API', () => {
  it('loads commands and trims names while preserving shell whitespace', async () => {
    expect((await request('GET')).status).toHaveBeenCalledWith(200);
    expect((await request('POST', { name: ' 状态 ', command: '  git status  ' })).status).toHaveBeenCalledWith(200);
    expect(mocks.update).toHaveBeenCalledWith({ action: 'create', value: { name: '状态', command: '  git status  ' } });
  });
  it.each([null, {}, { name: ' ', command: 'ls' }, { name: 'A', command: '\n ' }, { name: 'A', command: '\x1b[2J' }, { name: 'A'.repeat(41), command: 'ls' }, { name: 'A', command: 'x'.repeat(4001) }])('rejects invalid body %j', async (body) => {
    expect((await request('POST', body)).status).toHaveBeenCalledWith(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('requires IDs and maps edit/delete to one command', async () => {
    expect((await request('PATCH', { name: 'A', command: 'ls' })).status).toHaveBeenCalledWith(400);
    await request('PATCH', { id: 'one', name: 'A', command: 'ls' });
    expect(mocks.update).toHaveBeenLastCalledWith({ action: 'edit', id: 'one', value: { name: 'A', command: 'ls' } });
    await request('DELETE', { id: 'one' });
    expect(mocks.update).toHaveBeenLastCalledWith({ action: 'delete', id: 'one' });
  });
  it.each([404, 409, 500])('returns mutation error %s without success', async (status) => {
    mocks.update.mockRejectedValue(Object.assign(new Error('private disk path'), { status }));
    const res = await request('DELETE', { id: 'one' });
    expect(res.status).toHaveBeenCalledWith(status);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private disk path');
  });
  it('returns read errors and rejects unsupported methods', async () => {
    mocks.get.mockRejectedValue(new Error('disk'));
    expect((await request('GET')).status).toHaveBeenCalledWith(500);
    expect((await request('PUT')).status).toHaveBeenCalledWith(405);
  });
});

describe('terminal input framing', () => {
  it.each([
    ['git status', 'git status\r'],
    ['printf a\nprintf b', 'printf a\rprintf b\r'],
    ['pwd\r\n', 'pwd\r'],
    ['pwd\r', 'pwd\r'],
    ['  echo "a b"  ', '  echo "a b"  \r'],
  ])('normalizes %j without adding an extra Enter', (command, expected) => {
    expect(terminalCommandInput(command)).toBe(expected);
  });
});
