import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ home: '', active: 0, peak: 0, scans: 0, stats: vi.fn() }));
vi.mock('os', async (original) => {
  const actual = await original<typeof import('os')>();
  return { ...actual, default: { ...actual, homedir: () => mocks.home } };
});
vi.mock('fs', async (original) => {
  const actual = await original<typeof import('fs')>();
  return { ...actual, createReadStream: (...args: Parameters<typeof actual.createReadStream>) => {
    mocks.scans++;
    return actual.createReadStream(...args);
  } };
});
vi.mock('@/lib/stats/jsonl-parser-codex', () => ({ readCodexSessionStats: mocks.stats }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: vi.fn() }) }));

let list: typeof import('@/lib/codex-session-list');
let day: string;
beforeEach(async () => {
  vi.resetModules();
  mocks.home = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-list-'));
  const today = new Date();
  day = path.join(mocks.home, '.codex/sessions', String(today.getFullYear()), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0'));
  await fs.mkdir(day, { recursive: true });
  mocks.active = mocks.peak = mocks.scans = 0;
  mocks.stats.mockReset().mockImplementation(async () => {
    mocks.active++;
    mocks.peak = Math.max(mocks.peak, mocks.active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    mocks.active--;
    return { model: 'gpt-5', totalTokens: 123 };
  });
  list = await import('@/lib/codex-session-list');
  list.clearCodexSessionListCache();
});
afterEach(async () => {
  list.clearCodexSessionListCache();
  vi.restoreAllMocks();
  await fs.rm(mocks.home, { recursive: true, force: true });
});

const writeSession = async (id: string, cwd = '/project') => {
  const file = path.join(day, `${id}.jsonl`);
  await fs.writeFile(file, [
    { type: 'session_meta', payload: { id, timestamp: '2026-10-10T00:00:00Z', cwd } },
    { type: 'event_msg', payload: { type: 'user_message', message: 'hello' } },
  ].map((entry) => JSON.stringify(entry)).join('\n') + '\n');
  return file;
};

describe('Codex session list', () => {
  it('bounds concurrent loads while preserving filtering, metadata, counts and sorting', async () => {
    const files = await Promise.all(Array.from({ length: 35 }, (_, i) => writeSession(`s-${i}`)));
    await writeSession('elsewhere', '/other');
    await fs.writeFile(path.join(day, 'invalid.jsonl'), 'invalid');
    await fs.utimes(files[0], new Date('2026-10-11'), new Date('2026-10-11'));
    const result = await list.listCodexSessions({ cwd: '/project', daysBack: 1 });
    expect(result.sessions).toHaveLength(35);
    expect(result.scannedDirs).toBe(1);
    expect(result.scannedFiles).toBe(37);
    expect(result.sessions[0]).toMatchObject({ sessionId: 's-0', firstUserMessage: 'hello', turnCount: 1, model: 'gpt-5', totalTokens: 123 });
    expect(mocks.peak).toBeGreaterThan(1);
    expect(mocks.peak).toBeLessThanOrEqual(10);
  });

  it('reuses metadata past 30 seconds but detects append, deletion and explicit clear', async () => {
    const file = await writeSession('one');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await list.listCodexSessions({ cwd: '/project', daysBack: 1 });
    clock.mockReturnValue(32_000);
    await list.listCodexSessions({ cwd: '/project', daysBack: 1 });
    expect(mocks.scans).toBe(1);
    await fs.appendFile(file, JSON.stringify({ type: 'event_msg', payload: { type: 'user_message', message: 'next' } }) + '\n');
    const updated = await list.listCodexSessions({ cwd: '/project', daysBack: 1 });
    expect(updated.sessions[0].turnCount).toBe(2);
    expect(mocks.scans).toBe(2);
    list.clearCodexSessionListCache();
    await list.listCodexSessions({ cwd: '/project', daysBack: 1 });
    expect(mocks.scans).toBe(3);
    await fs.unlink(file);
    expect((await list.listCodexSessions({ cwd: '/project', daysBack: 1 })).sessions).toEqual([]);
  });

  it('recovers token metadata after a transient stats failure without rescanning messages', async () => {
    await writeSession('one');
    mocks.stats.mockRejectedValueOnce(new Error('temporary read error'));
    const fallback = await list.listCodexSessions({ cwd: '/project', daysBack: 1 });
    expect(fallback.sessions[0].totalTokens).toBeNull();
    const recovered = await list.listCodexSessions({ cwd: '/project', daysBack: 1 });
    expect(recovered.sessions[0].totalTokens).toBe(123);
    expect(mocks.scans).toBe(1);
  });
});
