import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({ count: 0 }));
vi.mock('fs', async (original) => {
  const actual = await original<typeof import('fs')>();
  return {
    ...actual,
    createReadStream: (...args: Parameters<typeof actual.createReadStream>) => {
      reads.count++;
      return actual.createReadStream(...args);
    },
  };
});
vi.mock('@/lib/providers/claude/session-detection', () => ({ toClaudeProjectName: (cwd: string) => cwd }));
vi.mock('@/lib/tmux', () => ({ getSessionCwd: async () => '' }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: vi.fn() }) }));
import { parseSessionMeta } from '@/lib/session-list';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('Claude session metadata integration', () => {
  it('coalesces real file reads and refreshes on append, rewrite and deletion', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-meta-regression-'));
    directories.push(dir);
    const file = path.join(dir, 'session.jsonl');
    const first = JSON.stringify({ type: 'user', message: 'first' }) + '\n';
    await fs.writeFile(file, first);
    reads.count = 0;
    const concurrent = await Promise.all(Array.from({ length: 10 }, () => parseSessionMeta(file)));
    expect(concurrent.every((meta) => meta?.firstMessage === 'first' && meta.turnCount === 1)).toBe(true);
    expect(reads.count).toBe(1);
    const original = await fs.stat(file);
    await fs.appendFile(file, JSON.stringify({ type: 'user', message: 'second' }) + '\n');
    await fs.utimes(file, original.atime, original.mtime);
    expect(await parseSessionMeta(file)).toMatchObject({ firstMessage: 'first', turnCount: 2 });
    await fs.writeFile(file, JSON.stringify({ type: 'user', message: 'replacement' }) + '\n');
    expect(await parseSessionMeta(file)).toMatchObject({ firstMessage: 'replacement', turnCount: 1 });
    await fs.unlink(file);
    expect(await parseSessionMeta(file)).toBeNull();
  });

  it('keeps same-id sessions in separate projects independent', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-meta-path-'));
    directories.push(dir);
    await Promise.all(['a', 'b'].map(async (project) => {
      await fs.mkdir(path.join(dir, project));
      const file = path.join(dir, project, 'session.jsonl');
      await fs.writeFile(file, JSON.stringify({ type: 'user', message: project }) + '\n');
      expect(await parseSessionMeta(file)).toMatchObject({ sessionId: 'session', firstMessage: project });
    }));
  });
});

describe.skipIf(process.env.PERF_SESSION_LIST !== '1')('session metadata benchmark', () => {
  it('reports cold, warm, and 31-second refresh scans over synthetic data', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-meta-bench-'));
    directories.push(dir);
    const line = JSON.stringify({ type: 'assistant', message: { content: 'x'.repeat(1024) } }) + '\n';
    const content = JSON.stringify({ type: 'user', timestamp: '2026-10-10T00:00:00Z', message: 'question' }) + '\n' + line.repeat(1000);
    const files = Array.from({ length: 50 }, (_, index) => path.join(dir, `session-${index}.jsonl`));
    await Promise.all(files.map((file) => fs.writeFile(file, content)));
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const results = [];
    for (const phase of ['cold', 'warm', 'after-31s']) {
      if (phase === 'after-31s') clock.mockReturnValue(1_031_000);
      reads.count = 0;
      const started = performance.now();
      const sessions = [];
      for (let index = 0; index < files.length; index += 10) {
        sessions.push(...await Promise.all(files.slice(index, index + 10).map(parseSessionMeta)));
      }
      expect(sessions).toHaveLength(50);
      expect(sessions.every((meta) => meta?.firstMessage === 'question' && meta.turnCount === 1)).toBe(true);
      results.push({ phase, milliseconds: Math.round(performance.now() - started), scans: reads.count, fixtureBytes: Buffer.byteLength(content) * files.length });
    }
    await fs.writeFile(path.join(os.tmpdir(), 'purplemux-session-benchmark.json'), JSON.stringify(results, null, 2));
  });
});
