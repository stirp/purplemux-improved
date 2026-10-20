import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:os', () => ({ default: { cpus: vi.fn(), totalmem: vi.fn(), freemem: vi.fn(), platform: vi.fn() } }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
const cores = (idle: number, busy: number, count = 2) => Array.from({ length: count }, () => ({
  model: 'test', speed: 100, times: { idle, user: busy, sys: 0, nice: 0, irq: 0 },
}));
const advance = (ms = 3000) => vi.setSystemTime(Date.now() + ms);
let sample: typeof import('@/lib/system-resources').getSystemResources;

beforeEach(async () => {
  vi.resetModules();
  delete (globalThis as Record<string, unknown>).__ptResourceSampler;
  vi.useFakeTimers(); vi.setSystemTime(100_000);
  vi.mocked(os.cpus).mockReturnValue(cores(100, 100));
  vi.mocked(os.totalmem).mockReturnValue(8192 * 1024);
  vi.mocked(os.freemem).mockReturnValue(1024 * 1024);
  vi.mocked(os.platform).mockReturnValue('linux');
  vi.mocked(readFile).mockResolvedValue('MemTotal:       8192 kB\nMemAvailable:    3072 kB\n');
  sample = (await import('@/lib/system-resources')).getSystemResources;
});
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('host resource sampler', () => {
  it('warms up then normalizes multiple cores to whole-machine capacity', async () => {
    expect((await sample()).cpu).toBeNull();
    advance(); vi.mocked(os.cpus).mockReturnValue(cores(175, 125));
    expect((await sample()).cpu).toBe(25);
    advance(); vi.mocked(os.cpus).mockReturnValue(cores(175, 225));
    expect((await sample()).cpu).toBe(100);
    advance(); vi.mocked(os.cpus).mockReturnValue(cores(275, 225));
    expect((await sample()).cpu).toBe(0);
  });
  it('shares in-flight and cached snapshots across clients and module reloads', async () => {
    const first = sample();
    expect(sample()).toBe(first);
    const snapshot = await first;
    advance(1000);
    vi.resetModules();
    const reloaded = (await import('@/lib/system-resources')).getSystemResources;
    expect(await reloaded()).toBe(snapshot);
    expect(os.cpus).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledTimes(1);
  });
  it('uses available memory excluding reclaimable cache on Linux', async () => {
    expect((await sample()).memory).toEqual({ used: 5120 * 1024, available: 3072 * 1024, total: 8192 * 1024, basis: 'available' });
  });
  it.each(['darwin', 'win32'] as const)('uses OS free memory on %s', async (platform) => {
    vi.mocked(os.platform).mockReturnValue(platform);
    expect((await sample()).memory).toMatchObject({ used: 7168 * 1024, basis: 'free' });
    expect(readFile).not.toHaveBeenCalled();
  });
  it.each(['missing', 'error'])('falls back when MemAvailable is %s', async (kind) => {
    if (kind === 'missing') vi.mocked(readFile).mockResolvedValue('MemFree: 1024 kB');
    else vi.mocked(readFile).mockRejectedValueOnce(new Error('unavailable'));
    expect((await sample()).memory).toMatchObject({ used: 7168 * 1024, basis: 'free' });
  });
  it('clamps available memory to total memory', async () => {
    vi.mocked(readFile).mockResolvedValue('MemAvailable: 99999 kB');
    expect((await sample()).memory.used).toBe(0);
  });
  it('warms up again after a long gap, core changes or reset counters', async () => {
    await sample(); advance(16_000);
    expect((await sample()).cpu).toBeNull();
    advance(); vi.mocked(os.cpus).mockReturnValue(cores(150, 150, 4));
    expect((await sample()).cpu).toBeNull();
    advance(); vi.mocked(os.cpus).mockReturnValue(cores(0, 0, 4));
    expect((await sample()).cpu).toBeNull();
  });
  it('clears a failed request so future reads can recover', async () => {
    vi.mocked(os.cpus).mockImplementationOnce(() => { throw new Error('unavailable'); });
    await expect(sample()).rejects.toThrow();
    expect(await sample()).toMatchObject({ cpu: null });
  });
});
