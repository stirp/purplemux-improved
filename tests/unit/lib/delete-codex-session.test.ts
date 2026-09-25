import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('child_process', () => ({ spawn: mocks.spawn }));
vi.mock('@/lib/preflight', () => ({ getShellPath: async () => '/test/bin' }));
import { deleteCodexSession } from '@/lib/delete-codex-session';

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); });

const child = () => {
  const process = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stdin: Object.assign(new EventEmitter(), { write: vi.fn(), end: vi.fn() }),
    kill: vi.fn(),
  });
  mocks.spawn.mockReturnValueOnce(process);
  const reply = (data: object) => process.stdout.write(`${JSON.stringify(data)}\n`);
  const requests = () => process.stdin.write.mock.calls.map(([line]) => JSON.parse(line));
  return { process, reply, requests };
};

describe('Codex native deletion protocol', () => {
  it('initializes before deleting exactly the selected thread and waits for acknowledgement', async () => {
    const { process, reply, requests } = child();
    const result = deleteCodexSession('id-1');
    await Promise.resolve();
    expect(requests()[0].method).toBe('initialize');
    reply({ id: 1, result: {} });
    expect(requests().slice(1)).toEqual([
      { method: 'initialized', params: {} },
      { id: 2, method: 'thread/delete', params: { threadId: 'id-1' } },
    ]);
    expect(process.kill).not.toHaveBeenCalled();
    reply({ id: 2, result: {} });
    await result;
    expect(process.kill).toHaveBeenCalledOnce();
  });
  it('does not delete anything if initialization fails', async () => {
    const { reply, requests } = child();
    const result = deleteCodexSession('id-1');
    await Promise.resolve();
    reply({ id: 1, error: { message: 'Unsupported' } });
    await expect(result).rejects.toThrow('Unsupported');
    expect(requests()).toHaveLength(1);
  });
  it('surfaces a native deletion refusal', async () => {
    const { reply } = child();
    const result = deleteCodexSession('id-1');
    await Promise.resolve();
    reply({ id: 1, result: {} });
    reply({ id: 2, error: { message: 'Thread is active' } });
    await expect(result).rejects.toThrow('Thread is active');
  });
  it('times out without reporting success and terminates the helper', async () => {
    const { process } = child();
    const result = deleteCodexSession('id-1');
    const rejected = expect(result).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(30_000);
    await rejected;
    expect(process.kill).toHaveBeenCalledOnce();
  });
});
