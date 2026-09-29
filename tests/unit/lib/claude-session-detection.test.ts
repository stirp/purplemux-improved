import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ children: vi.fn(), args: vi.fn(), access: vi.fn(), readdir: vi.fn(), readFile: vi.fn(), cwd: vi.fn() }));
vi.mock('@/lib/process-utils', () => ({ getChildPids: mocks.children, getProcessArgs: mocks.args, getProcessCwd: mocks.cwd, isProcessRunning: vi.fn() }));
vi.mock('fs/promises', () => ({ default: { access: mocks.access, readdir: mocks.readdir, readFile: mocks.readFile, unlink: vi.fn() } }));
import { detectActiveSession, isClaudeRunning } from '@/lib/providers/claude/session-detection';
beforeEach(() => {
  vi.resetAllMocks();
  mocks.children.mockResolvedValue([]);
  mocks.args.mockResolvedValue('fish');
});
describe('Claude running detection', () => {
  it('recognizes Claude behind the extra shell used by workspace terminals', async () => {
    mocks.children.mockImplementation(async (pid) => pid === 10 ? [20] : pid === 20 ? [30] : []);
    mocks.args.mockImplementation(async (pid) => pid === 30 ? 'claude --settings /tmp/hooks.json' : 'fish');
    expect(await isClaudeRunning(10)).toBe(true);
  });
  it('also searches grandchildren when immediate children were preloaded', async () => {
    mocks.children.mockResolvedValue([30]);
    mocks.args.mockImplementation(async (pid) => pid === 30 ? 'claude' : 'fish');
    expect(await isClaudeRunning(10, [20])).toBe(true);
    expect(mocks.children).not.toHaveBeenCalledWith(10);
  });
  it('still recognizes a direct Claude child', async () => {
    mocks.args.mockResolvedValue('claude');
    expect(await isClaudeRunning(10, [20])).toBe(true);
  });
  it('does not report an unrelated or exited child as Claude', async () => {
    mocks.children.mockResolvedValue([30]);
    mocks.args.mockImplementation(async (pid) => pid === 30 ? null : 'fish');
    expect(await isClaudeRunning(10, [20])).toBe(false);
  });
});


describe('Claude session binding through launch wrappers', () => {
  it('stops after 16 descendant levels', async () => {
    mocks.children.mockImplementation(async (pid: number) => [pid + 1]);
    expect(await isClaudeRunning(10)).toBe(false);
    expect(mocks.args.mock.calls.map(([pid]) => pid)).toHaveLength(16);
    expect(mocks.children.mock.calls.map(([pid]) => pid)).not.toContain(26);
  });

  it('caps candidates and child lookups for a wide tree', async () => {
    mocks.children.mockResolvedValue(Array.from({ length: 5000 }, (_, index) => index + 20));
    expect(await isClaudeRunning(10)).toBe(false);
    expect(mocks.args).toHaveBeenCalledTimes(1024);
    expect(mocks.children).toHaveBeenCalledTimes(1);
  });

  it('limits concurrent child lookups to 16', async () => {
    let running = 0;
    let peak = 0;
    mocks.children.mockImplementation(async () => {
      peak = Math.max(peak, ++running);
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      running--;
      return [];
    });
    await isClaudeRunning(10, Array.from({ length: 60 }, (_, index) => index + 20));
    expect(peak).toBeLessThanOrEqual(16);
  });
  it.each([3, 5, 8])('binds the real PID through %i process levels', async (depth) => {
    const root = 10;
    const leaf = root + depth;
    const sessionId = '12345678-1234-1234-1234-123456789abc';
    mocks.children.mockImplementation(async (pid: number) => pid < leaf ? [pid + 1] : []);
    mocks.args.mockImplementation(async (pid: number) => pid === leaf ? 'claude --settings /tmp/hooks.json' : 'node -e claude-launcher');
    mocks.access.mockResolvedValue(undefined);
    mocks.readdir.mockResolvedValue(['active.json', 'unrelated.json']);
    mocks.readFile.mockResolvedValue(JSON.stringify({ pid: leaf, sessionId, cwd: '/repo', startedAt: 100 }));
    expect(await isClaudeRunning(root, [root + 1])).toBe(true);
    expect(await detectActiveSession(root, [root + 1])).toMatchObject({ status: 'running', pid: leaf, sessionId, cwd: '/repo' });
    expect(mocks.children).not.toHaveBeenCalledWith(root);
  });

  it('uses deep resume arguments when no PID file exists', async () => {
    const sessionId = '12345678-1234-1234-1234-123456789abc';
    mocks.children.mockImplementation(async (pid: number) => pid < 15 ? [pid + 1] : []);
    mocks.args.mockImplementation(async (pid: number) => pid === 15 ? `claude --resume ${sessionId}` : 'fish');
    mocks.access.mockResolvedValue(undefined);
    mocks.readdir.mockResolvedValue([]);
    mocks.cwd.mockResolvedValue('/repo');
    expect(await detectActiveSession(10)).toMatchObject({ status: 'running', pid: 15, sessionId });
  });

  it('deduplicates descendants and never scans the root again', async () => {
    mocks.children.mockImplementation(async (pid: number) => pid === 20 ? [10, 30, 30] : [20]);
    expect(await isClaudeRunning(10, [20, 20])).toBe(false);
    expect(mocks.children.mock.calls.map(([pid]) => pid)).toEqual([20, 30]);
  });

  it('does not bind unrelated PID files outside the pane tree', async () => {
    mocks.children.mockResolvedValue([]);
    mocks.access.mockResolvedValue(undefined);
    mocks.readdir.mockResolvedValue(['other.json']);
    mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 99, sessionId: 'other', cwd: '/repo' }));
    expect(await detectActiveSession(10, [20])).toMatchObject({ status: 'not-running', pid: null, sessionId: null });
  });
});
