import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async (original) => {
  const actual = await original<typeof import('os')>();
  return { ...actual, default: { ...actual, homedir: () => mocks.home } };
});
import { clearCodexDeletionProgress, readCodexDeletionProgress, withCodexDeletionLock, writeCodexDeletionProgress } from '@/lib/codex-deletion-progress';

beforeEach(async () => { mocks.home = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-codex-progress-')); });
afterEach(async () => { await fs.rm(mocks.home, { recursive: true, force: true }); });

describe('durable Codex deletion progress', () => {
  it('reads the last saved pending members after module reload and removes a completed plan', async () => {
    await writeCodexDeletionProgress('parent', ['child', 'parent']);
    vi.resetModules();
    const reloaded = await import('@/lib/codex-deletion-progress');
    expect(await reloaded.readCodexDeletionProgress('parent')).toEqual(['child', 'parent']);
    const file = path.join(mocks.home, '.purplemux/session-deletions/codex/parent.json');
    expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
    await reloaded.writeCodexDeletionProgress('parent', []);
    await clearCodexDeletionProgress('parent');
    await expect(fs.access(file)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readCodexDeletionProgress('parent')).toEqual([]);
  });

  it.each([
    '{', JSON.stringify({ version: 2, pending: ['parent'] }),
    JSON.stringify({ version: 1, pending: ['../outside', 'parent'] }),
    JSON.stringify({ version: 1, pending: ['child', 'child', 'parent'] }),
    JSON.stringify({ version: 1, pending: ['other'] }),
  ])('rejects malformed or mismatched progress: %s', async (data) => {
    const directory = path.join(mocks.home, '.purplemux/session-deletions/codex');
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'parent.json'), data);
    await expect(readCodexDeletionProgress('parent')).rejects.toThrow();
  });

  it('serializes the same parent across module instances and releases the lock after failure', async () => {
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const ready = new Promise<void>((resolve) => { started = resolve; });
    const first = withCodexDeletionLock('parent', async () => {
      await writeCodexDeletionProgress('parent', ['child', 'parent']);
      started();
      await gate;
      throw new Error('cleanup failed');
    });
    const failure = expect(first).rejects.toThrow('cleanup failed');
    await ready;
    vi.resetModules();
    const reloaded = await import('@/lib/codex-deletion-progress');
    const secondAction = vi.fn(async () => {
      expect(await reloaded.readCodexDeletionProgress('parent')).toEqual(['child', 'parent']);
      await reloaded.writeCodexDeletionProgress('parent', []);
    });
    const second = reloaded.withCodexDeletionLock('parent', secondAction);
    try {
      await withCodexDeletionLock('unrelated', async () => {});
      expect(secondAction).not.toHaveBeenCalled();
    } finally { release(); }
    await failure;
    await second;
    expect(secondAction).toHaveBeenCalledOnce();
    expect(await readCodexDeletionProgress('parent')).toEqual([]);
  });
});
