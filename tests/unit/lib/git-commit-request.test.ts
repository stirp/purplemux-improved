import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestCommit } from '@/lib/git-commit-request';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('commit request timeout compatibility', () => {
  it.each([408, 504])('classifies HTML HTTP %s without exposing parser errors', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Gateway Timeout</html>', { status })));
    await expect(requestCommit('session', 'generate')).rejects.toMatchObject({ code: 'generateTimeout' });
  });
  it('preserves structured server errors and successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ error: 'changed', code: 'changed' }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({ title: 'Generated title', body: '' })));
    await expect(requestCommit('session', 'commit')).rejects.toMatchObject({ code: 'changed', message: 'changed' });
    await expect(requestCommit('session', 'generate')).resolves.toEqual({ title: 'Generated title', body: '' });
  });
  it.each([502, 200])('handles non-JSON HTTP %s without showing HTML', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Error</html>', { status })));
    await expect(requestCommit('session', 'generate')).rejects.toMatchObject({ code: 'requestFailed' });
  });
  it('stops a stalled request and allows a manual retry', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementationOnce((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })).mockResolvedValueOnce(Response.json({ title: 'Retry succeeded' }));
    vi.stubGlobal('fetch', fetch);
    const rejected = expect(requestCommit('session', 'generate')).rejects.toMatchObject({ code: 'generateTimeout' });
    await vi.advanceTimersByTimeAsync(150_000);
    await rejected;
    expect(fetch).toHaveBeenCalledTimes(1);
    await expect(requestCommit('session', 'generate')).resolves.toEqual({ title: 'Retry succeeded' });
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['timeout', 'network', 'html'])('does not retry a commit with an uncertain %s result', async (kind) => {
    const fetch = vi.fn();
    if (kind === 'network') fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    else fetch.mockResolvedValue(new Response('<html>Error</html>', { status: kind === 'timeout' ? 504 : 502 }));
    vi.stubGlobal('fetch', fetch);
    await expect(requestCommit('session', 'commit')).rejects.toMatchObject({ code: 'commitUnknown' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('preserves caller cancellation and clears the deadline', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })));
    const controller = new AbortController();
    const rejected = expect(requestCommit('session', 'inspect', {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });
});
