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
  it.each(['POST', 'PATCH'])('%s accepts boolean autoEnter and rejects other types', async (method) => {
    for (const autoEnter of [true, false]) {
      const body = { id: 'one', name: 'A', command: 'ls', autoEnter };
      expect((await request(method, body)).status).toHaveBeenCalledWith(200);
      expect(mocks.update).toHaveBeenLastCalledWith(expect.objectContaining({ value: { name: 'A', command: 'ls', autoEnter } }));
    }
    mocks.update.mockClear();
    for (const autoEnter of ['false', 0, null, {}]) {
      expect((await request(method, { id: 'one', name: 'A', command: 'ls', autoEnter })).status).toHaveBeenCalledWith(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
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
  it.each(['POST', 'PATCH'])('%s rejects every forbidden C0, DEL and C1 character before persistence', async (method) => {
    const controls = [...Array.from({ length: 32 }, (_, code) => code), ...Array.from({ length: 33 }, (_, offset) => 0x7f + offset)];
    for (const code of controls.filter((code) => ![9, 10, 13].includes(code))) {
      const res = await request(method, { id: 'one', name: '命令', command: `echo a${String.fromCodePoint(code)}b` });
      expect(res.status, `U+${code.toString(16).padStart(4, '0')}`).toHaveBeenCalledWith(400);
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(['POST', 'PATCH'])('%s preserves tabs, line breaks and ordinary Unicode text', async (method) => {
    const value = { name: '命令', command: 'echo\t"中文 café 😀\u00a0"\r\necho done\n' };
    expect((await request(method, { id: 'one', ...value })).status).toHaveBeenCalledWith(200);
    expect(mocks.update).toHaveBeenCalledWith(method === 'POST'
      ? { action: 'create', value }
      : { action: 'edit', id: 'one', value });
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
    const res = await request('OPTIONS');
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.setHeader).toHaveBeenCalledWith('Allow', 'GET, POST, PATCH, DELETE, PUT');
  });
  it('accepts ID-only ordering without updating command contents', async () => {
    const commands = [{ id: 'two', name: 'B', command: 'pwd' }, { id: 'one', name: 'A', command: 'ls' }];
    mocks.update.mockResolvedValue(commands);
    const res = await request('PUT', { ids: ['two', 'one'] });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(commands);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ action: 'reorder', ids: ['two', 'one'] });
  });
  it.each([null, {}, { ids: 'one' }, { ids: [1] }, { ids: [''] }, { ids: ['x'.repeat(101)] },
    { ids: ['one', 'one'] }, { ids: Array.from({ length: 51 }, (_, i) => `${i}`) }])('rejects malformed order %j', async (body) => {
    expect((await request('PUT', body)).status).toHaveBeenCalledWith(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([409, 500])('reports reorder failure %s', async (status) => {
    mocks.update.mockRejectedValue(Object.assign(new Error('private path'), { status }));
    const res = await request('PUT', { ids: ['one'] });
    expect(res.status).toHaveBeenCalledWith(status);
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('private path');
  });
});

describe('terminal input framing', () => {
  it.each([
    ['git status', 'git status'],
    ['  pwd  ', '  pwd  '],
    ['echo a\r\necho b', 'echo a\recho b'],
    ['pwd\n', 'pwd\r'],
    ['pwd\r', 'pwd\r'],
  ])('does not append Enter when disabled for %j', (command, expected) => {
    expect(terminalCommandInput(command, false)).toBe(expected);
  });
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
