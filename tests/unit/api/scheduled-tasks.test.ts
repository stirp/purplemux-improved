import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), change: vi.fn(), run: vi.fn() }));
vi.mock('@/lib/scheduled-task-service', () => ({ listScheduledTasks: mocks.list, saveScheduledTask: mocks.save, changeScheduledTask: mocks.change }));
vi.mock('@/lib/scheduled-task-scheduler', () => ({ getScheduledTaskScheduler: () => ({ runNow: mocks.run }) }));
import handler from '@/pages/api/scheduled-tasks';
const value = { name: 'test', kind: 'shell', cwd: '/tmp', content: 'pwd', timeoutMinutes: 30, enabled: true, schedule: { frequency: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' } };
const request = async (method: string, body?: unknown, workspaceId: unknown = 'ws') => {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
  await handler({ method, body, query: { workspaceId } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => { vi.resetAllMocks(); mocks.list.mockResolvedValue([]); mocks.save.mockResolvedValue([]); mocks.change.mockResolvedValue([]); mocks.run.mockResolvedValue({ id: 'run' }); });
describe('scheduled tasks API', () => {
  it('loads, creates, updates, pauses, enables, runs and deletes by workspace', async () => {
    expect((await request('GET')).status).toHaveBeenCalledWith(200);
    expect(mocks.list).toHaveBeenCalledWith('ws');
    expect((await request('POST', value)).status).toHaveBeenCalledWith(201);
    expect((await request('PUT', { id: 'one', task: value })).status).toHaveBeenCalledWith(200);
    expect(mocks.save).toHaveBeenLastCalledWith('ws', value, 'one');
    for (const action of ['pause', 'enable']) {
      expect((await request('PATCH', { id: 'one', action })).status).toHaveBeenCalledWith(200);
      expect(mocks.change).toHaveBeenLastCalledWith('ws', 'one', action);
    }
    expect((await request('PATCH', { id: 'one', action: 'run' })).status).toHaveBeenCalledWith(202);
    expect(mocks.run).toHaveBeenCalledWith('ws', 'one');
    expect((await request('DELETE', { id: 'one' })).status).toHaveBeenCalledWith(200);
    expect(mocks.change).toHaveBeenLastCalledWith('ws', 'one', 'delete');
  });
  it.each([
    ['POST', {}], ['PUT', { id: 'one', task: {} }], ['PATCH', { id: 'one', action: 'reset' }], ['DELETE', { id: 3 }],
    ['POST', { ...value, runs: [] }], ['PATCH', { id: 'one', action: 'run', cwd: '/' }],
  ])('rejects malformed %s requests', async (method, body) => {
    expect((await request(method as string, body)).status).toHaveBeenCalledWith(400);
    expect(mocks.save).not.toHaveBeenCalled(); expect(mocks.change).not.toHaveBeenCalled(); expect(mocks.run).not.toHaveBeenCalled();
  });
  it.each([undefined, [], ['ws', 'other'], '', 42])('requires one workspace ID: %j', async (workspace) => {
    expect((await request('GET', null, workspace === undefined ? null : workspace)).status).toHaveBeenCalledWith(400);
  });
  it.each([400, 404, 409, 503])('preserves domain status %s', async (status) => {
    mocks.run.mockRejectedValue(Object.assign(new Error('private details'), { status, code: 'running' }));
    const result = await request('PATCH', { id: 'one', action: 'run' });
    expect(result.status).toHaveBeenCalledWith(status);
    expect(result.json).toHaveBeenCalledWith({ error: 'running' });
  });
  it('hides internal errors and rejects unsupported methods', async () => {
    mocks.list.mockRejectedValue(new Error('private details'));
    const result = await request('GET');
    expect(result.status).toHaveBeenCalledWith(500); expect(result.json).toHaveBeenCalledWith({ error: 'storage' });
    expect((await request('HEAD')).status).toHaveBeenCalledWith(405);
  });
});
