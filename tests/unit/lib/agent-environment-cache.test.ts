import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), watch: vi.fn(), write: vi.fn(), rename: vi.fn(), broadcast: vi.fn(), close: vi.fn(), on: vi.fn(), open: vi.fn() }));
vi.mock('fs/promises', () => ({ default: { open: mocks.open, writeFile: mocks.write, rename: mocks.rename, unlink: vi.fn() } }));
vi.mock('fs', () => ({ watchFile: mocks.watch, unwatchFile: mocks.close }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: mocks.broadcast }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), info: vi.fn() }) }));
import { getAgentEnvironment, updateConfig, readConfig, writeConfig } from '@/lib/config-store';

beforeEach(() => {
  vi.resetAllMocks();
  const state = globalThis as unknown as Record<string, unknown>;
  for (const key of ['__ptAgentConfigCache', '__ptAgentConfigWatcher', '__ptConfigContentCache']) delete state[key];
  mocks.open.mockImplementation(async () => {
    const bytes = Buffer.from(await mocks.read());
    let offset = 0;
    return {
      stat: async () => ({ size: bytes.length, isFile: () => true }),
      read: async (buffer: Buffer, start: number, length: number) => {
        const bytesRead = bytes.copy(buffer, start, offset, offset + length);
        offset += bytesRead;
        return { bytesRead };
      },
      close: vi.fn(),
    };
  });
  mocks.watch.mockReturnValue({ close: mocks.close, on: mocks.on });
  mocks.read.mockResolvedValue(JSON.stringify({
    claudeEnvironment: { CLAUDE_ONLY_KEY: 'claude', SHARED: 'claude' },
    codexEnvironment: { CODEX_ONLY_KEY: 'codex', SHARED: 'codex' },
  }));
});

describe('agent environment config cache', () => {
  it('coalesces reads, isolates providers and does not share mutable results', async () => {
    const [claude, codex] = await Promise.all([getAgentEnvironment('claude'), getAgentEnvironment('codex')]);
    expect(claude).toEqual({ CLAUDE_ONLY_KEY: 'claude', SHARED: 'claude' });
    expect(claude).not.toHaveProperty('CODEX_ONLY_KEY');
    expect(codex).toEqual({ CODEX_ONLY_KEY: 'codex', SHARED: 'codex' });
    expect(codex).not.toHaveProperty('CLAUDE_ONLY_KEY');
    claude.SHARED = 'mutated';
    expect((await getAgentEnvironment('claude')).SHARED).toBe('claude');
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.watch).toHaveBeenCalledTimes(1);
  });

  it.each(['change', 'rename'])('invalidates on external file %s', async (event) => {
    await getAgentEnvironment('claude');
    mocks.read.mockResolvedValue(JSON.stringify({ claudeEnvironment: { NEW: 'value' } }));
    mocks.watch.mock.calls[0][2]({ mtimeMs: 2, ino: event === 'rename' ? 3 : 1 }, { mtimeMs: 1, ino: 1 });
    expect(await getAgentEnvironment('claude')).toEqual({ NEW: 'value' });
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it('invalidates immediately after a successful application save', async () => {
    await getAgentEnvironment('claude');
    await updateConfig({ claudeEnvironment: { SAVED: 'value' } });
    mocks.read.mockResolvedValue(JSON.stringify({ claudeEnvironment: { SAVED: 'value' } }));
    expect(await getAgentEnvironment('claude')).toEqual({ SAVED: 'value' });
    expect(mocks.read).toHaveBeenCalledTimes(3);
  });

  it('does not restore stale cached reads after invalidation', async () => {
    let resolve!: (raw: string) => void;
    mocks.read.mockImplementationOnce(() => new Promise<string>((done) => { resolve = done; }));
    const pending = getAgentEnvironment('claude');
    mocks.watch.mock.calls[0][2]({ mtimeMs: 2 }, { mtimeMs: 1 });
    resolve(JSON.stringify({ claudeEnvironment: { OLD: 'value' } }));
    await pending;
    expect(await getAgentEnvironment('claude')).not.toHaveProperty('OLD');
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it('reads fresh configuration if a watcher cannot be installed', async () => {
    mocks.watch.mockImplementation(() => { throw new Error('unavailable'); });
    await getAgentEnvironment('claude');
    await getAgentEnvironment('claude');
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });

  it('drops the cache and retries watching after a watcher error', async () => {
    await getAgentEnvironment('claude');
    mocks.on.mock.calls[0][1](new Error('watch failed'));
    await getAgentEnvironment('claude');
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.watch).toHaveBeenCalledTimes(2);
    expect(mocks.read).toHaveBeenCalledTimes(2);
  });
});


it('keeps the cache when config file metadata is unchanged', async () => {
  await getAgentEnvironment('claude');
  const metadata = { mtimeMs: 1, ctimeMs: 1, ino: 1, size: 100 };
  for (let index = 0; index < 20; index++) mocks.watch.mock.calls[0][2](metadata, { ...metadata });
  await getAgentEnvironment('claude');
  expect(mocks.read).toHaveBeenCalledTimes(1);
  expect(mocks.watch.mock.calls[0][0]).toMatch(/config.json$/);
});

it('rejects oversized files before reading, closes the handle and can retry after repair', async () => {
  const read = vi.fn();
  const close = vi.fn();
  mocks.open.mockResolvedValueOnce({ stat: async () => ({ size: 4 * 1024 * 1024 + 1, isFile: () => true }), read, close });
  await expect(getAgentEnvironment('claude')).rejects.toThrow('4 MiB');
  expect(read).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
  expect(await getAgentEnvironment('claude')).toHaveProperty('CLAUDE_ONLY_KEY');
});

it('bounds config reads if the file grows after stat', async () => {
  const close = vi.fn();
  const read = vi.fn(async (_buffer, _offset, length) => ({ bytesRead: length }));
  mocks.open.mockResolvedValueOnce({ stat: async () => ({ size: 1, isFile: () => true }), read, close });
  await expect(readConfig()).rejects.toThrow('4 MiB');
  expect(read.mock.calls[0][2]).toBe(4 * 1024 * 1024 + 1);
  expect(read).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

it('rejects oversized UTF-8 writes without writing or broadcasting', async () => {
  await expect(writeConfig({ customCSS: '字'.repeat(2 * 1024 * 1024), updatedAt: '' })).rejects.toThrow('4 MiB');
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.rename).not.toHaveBeenCalled();
  expect(mocks.broadcast).not.toHaveBeenCalled();
});
