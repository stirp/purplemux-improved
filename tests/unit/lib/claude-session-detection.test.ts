import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ children: vi.fn(), args: vi.fn() }));
vi.mock('@/lib/process-utils', () => ({ getChildPids: mocks.children, getProcessArgs: mocks.args, getProcessCwd: vi.fn(), isProcessRunning: vi.fn() }));
import { isClaudeRunning } from '@/lib/providers/claude/session-detection';
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
