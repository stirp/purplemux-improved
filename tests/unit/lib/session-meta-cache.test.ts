import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionMetaCache } from '@/lib/session-meta-cache';

const stat = (patch: Partial<Stats> = {}): Stats => ({
  dev: 1, ino: 1, size: 100, mtimeMs: 1, ctimeMs: 1, ...patch,
} as Stats);
afterEach(() => vi.restoreAllMocks());

describe('session metadata file cache', () => {
  it('reuses unchanged metadata beyond 30 seconds and coalesces concurrent reads', async () => {
    vi.spyOn(fs, 'stat').mockResolvedValue(stat());
    const clock = vi.spyOn(Date, 'now').mockReturnValue(0);
    const cache = createSessionMetaCache<string>();
    const load = vi.fn(async () => 'metadata');
    expect(await Promise.all(Array.from({ length: 20 }, () => cache.read('/one', load)))).toEqual(Array(20).fill('metadata'));
    clock.mockReturnValue(31_000);
    expect(await cache.read('/one', load)).toBe('metadata');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it.each(['size', 'mtimeMs', 'ctimeMs', 'ino', 'dev'] as const)('invalidates when %s changes', async (field) => {
    const metadata = vi.spyOn(fs, 'stat').mockResolvedValue(stat());
    const cache = createSessionMetaCache<string>();
    const load = vi.fn().mockResolvedValueOnce('old').mockResolvedValueOnce('new');
    await cache.read('/one', load);
    metadata.mockResolvedValue(stat({ [field]: 200 }));
    expect(await cache.read('/one', load)).toBe('new');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('isolates equal session names in different directories', async () => {
    vi.spyOn(fs, 'stat').mockResolvedValue(stat());
    const cache = createSessionMetaCache<string>();
    expect(await cache.read('/a/session.jsonl', async () => 'a')).toBe('a');
    expect(await cache.read('/b/session.jsonl', async () => 'b')).toBe('b');
  });

  it('does not serve cached metadata for a deleted file and retries after failure', async () => {
    const metadata = vi.spyOn(fs, 'stat').mockResolvedValue(stat());
    const cache = createSessionMetaCache<string>();
    const load = vi.fn().mockResolvedValueOnce('old').mockRejectedValueOnce(new Error('unreadable')).mockResolvedValue('new');
    await cache.read('/one', load);
    metadata.mockRejectedValueOnce(new Error('ENOENT'));
    await expect(cache.read('/one', load)).rejects.toThrow('ENOENT');
    metadata.mockResolvedValue(stat({ ino: 2 }));
    await expect(cache.read('/one', load)).rejects.toThrow('unreadable');
    expect(await cache.read('/one', load)).toBe('new');
  });

  it('does not cache null results or a file changed during parsing', async () => {
    const metadata = vi.spyOn(fs, 'stat').mockResolvedValue(stat());
    const cache = createSessionMetaCache<string>();
    await cache.read('/one', async () => null);
    metadata.mockResolvedValueOnce(stat()).mockResolvedValue(stat({ size: 200 }));
    expect(await cache.read('/one', async () => 'partial')).toBe('partial');
    const load = vi.fn(async () => 'complete');
    expect(await cache.read('/one', load)).toBe('complete');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('evicts least recently used metadata at capacity', async () => {
    vi.spyOn(fs, 'stat').mockResolvedValue(stat());
    const cache = createSessionMetaCache<string>(2);
    const load = vi.fn(async () => 'metadata');
    await cache.read('/a', load);
    await cache.read('/b', load);
    await cache.read('/a', load);
    await cache.read('/c', load);
    await cache.read('/a', load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.read('/b', load);
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('prevents a cleared request from repopulating the cache during final stat', async () => {
    let finishStat!: (value: Stats) => void;
    const metadata = vi.spyOn(fs, 'stat').mockResolvedValueOnce(stat())
      .mockImplementationOnce(() => new Promise<Stats>((resolve) => { finishStat = resolve; }));
    const cache = createSessionMetaCache<string>();
    const reading = cache.read('/one', async () => 'old');
    await vi.waitFor(() => expect(finishStat).toBeDefined());
    cache.clear();
    finishStat(stat());
    await reading;
    metadata.mockResolvedValue(stat());
    const load = vi.fn(async () => 'new');
    expect(await cache.read('/one', load)).toBe('new');
    expect(load).toHaveBeenCalledTimes(1);
  });
});
