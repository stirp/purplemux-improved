import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }) }));
import { CODEX_LAUNCHER_SCRIPT_CONTENT } from '@/lib/providers/codex';

const response = (status = 200) => ({
  ok: status === 200, status,
  json: async () => ({ args: ['resume', 'session-id'], env: { KEEP: 'configured' } }),
  text: async () => 'rejected',
});

const launch = (fetch: ReturnType<typeof vi.fn>, readFile: (file: string) => string = () => '8022') => {
  const child = new EventEmitter();
  const spawn = vi.fn(() => child);
  const exit = vi.fn();
  const kill = vi.fn();
  const error = vi.fn();
  const done = vm.runInNewContext(CODEX_LAUNCHER_SCRIPT_CONTENT, {
    require: (name: string) => {
      if (name === 'node:child_process') return { spawn, execFileSync: () => '--no-daemon' };
      if (name === 'node:fs') return { readFileSync: readFile };
      if (name === 'node:os') return { homedir: () => '/test' };
      if (name === 'node:path') return { join: (...parts: string[]) => parts.join('/') };
      throw new Error(`Unexpected module: ${name}`);
    },
    process: { argv: ['node', 'launcher', '--resume-session-id', 'session-id'], env: { KEEP: 'inherited' }, pid: 12, exit, kill },
    console: { error }, fetch, AbortController, Date, setTimeout, clearTimeout,
  }) as Promise<void>;
  return { done, spawn, exit, kill, error, child };
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Codex launcher startup lifecycle', () => {
  it('waits for the port file and starts only once with the current connection details', async () => {
    let ready = false;
    const fetch = vi.fn().mockResolvedValue(response());
    const readFile = vi.fn((file: string) => ready ? (file.endsWith('/port') ? '9000' : 'new-token') : '');
    const result = launch(fetch, readFile);
    await vi.advanceTimersByTimeAsync(499);
    expect(fetch).not.toHaveBeenCalled();
    expect(result.exit).not.toHaveBeenCalled();
    ready = true;
    await vi.advanceTimersByTimeAsync(1);
    await result.done;
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:9000/api/codex/launch-args', expect.objectContaining({
      headers: expect.objectContaining({ 'x-pmux-token': 'new-token' }),
    }));
    expect(result.spawn).toHaveBeenCalledExactlyOnceWith('codex', ['--no-daemon', 'resume', 'session-id'], {
      stdio: 'inherit', env: { KEEP: 'configured' },
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([502, 503, 504])('retries network failure and HTTP %i before a successful launch', async (status) => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(response(status)).mockResolvedValue(response());
    const result = launch(fetch);
    await vi.advanceTimersByTimeAsync(1000);
    await result.done;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.spawn).toHaveBeenCalledTimes(1);
    expect(result.exit).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([400, 401, 403, 500])('fails HTTP %i without retrying or starting Codex', async (status) => {
    const fetch = vi.fn().mockResolvedValue(response(status));
    const result = launch(fetch);
    await result.done;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.spawn).not.toHaveBeenCalled();
    expect(result.exit).toHaveBeenCalledWith(1);
    expect(result.error).toHaveBeenCalledWith(expect.stringContaining(`HTTP ${status}`));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['null', 'invalid-json'])('fails a malformed %s response without retrying', async (body) => {
    const fetch = vi.fn().mockResolvedValue({ ...response(), json: async () => {
      if (body === 'invalid-json') throw new SyntaxError('invalid json');
      return null;
    } });
    const result = launch(fetch);
    await result.done;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.spawn).not.toHaveBeenCalled();
    expect(result.exit).toHaveBeenCalledWith(1);
    expect(result.error).toHaveBeenCalledWith('invalid Codex launch args response');
  });

  it.each(['network', 'port'])('stops persistent %s failures at the total deadline', async (failure) => {
    const fetch = vi.fn().mockRejectedValue(new Error('fetch failed'));
    const result = launch(fetch, vi.fn(() => failure === 'port' ? '' : '8022'));
    await vi.advanceTimersByTimeAsync(14999);
    expect(result.exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await result.done;
    expect(result.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(result.spawn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['headers', 'body'])('bounds a stalled response %s by request and total deadlines', async (stage) => {
    const fetch = vi.fn((_url: string, { signal }: { signal: AbortSignal }) => {
      const stalled = () => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
      return stage === 'headers' ? stalled() : Promise.resolve({ ...response(), json: stalled });
    });
    const result = launch(fetch);
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(501);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(9500);
    await result.done;
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.spawn).not.toHaveBeenCalled();
    expect(result.exit).toHaveBeenCalledWith(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not restart Codex after its normal exit', async () => {
    const fetch = vi.fn().mockResolvedValue(response());
    const result = launch(fetch);
    await result.done;
    result.child.emit('exit', 0, null);
    await vi.advanceTimersByTimeAsync(30000);
    expect(result.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(result.spawn).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
