import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';

const mocks = vi.hoisted(() => ({
  children: vi.fn(), args: vi.fn(), argv: vi.fn(), cwd: vi.fn(), readFile: vi.fn(), readdir: vi.fn(), realpath: vi.fn(),
}));
vi.mock('@/lib/process-utils', () => ({
  getChildPids: mocks.children, getProcessArgs: mocks.args, getProcessArgv: mocks.argv,
  getProcessCwd: mocks.cwd, getProcessStartTimeMs: vi.fn(), isProcessRunning: vi.fn(),
}));
vi.mock('fs/promises', () => ({ default: {
  access: vi.fn(), readdir: mocks.readdir, readFile: mocks.readFile, unlink: vi.fn(), realpath: mocks.realpath,
} }));
vi.mock('@/lib/tmux', () => ({ hasSession: async () => true, getSessionPanePid: async () => 10 }));
vi.mock('@/lib/providers', async () => {
  const claude = await import('@/lib/providers/claude/session-detection');
  const codex = await import('@/lib/providers/codex/session-detection');
  return { listProviders: () => [
    { id: 'claude', panelType: 'claude-code', displayName: 'Claude', isAgentRunning: claude.isClaudeRunning, detectActiveSession: claude.detectActiveSession },
    { id: 'codex', panelType: 'codex-cli', displayName: 'Codex', isAgentRunning: codex.isCodexRunning, detectActiveSession: codex.detectActiveSession },
  ] };
});

import handler from '@/pages/api/check-agent';
import { detectActiveSession as detectClaude, isClaudeRunning } from '@/lib/providers/claude/session-detection';
import { detectActiveSession as detectCodex, isCodexRunning } from '@/lib/providers/codex/session-detection';

const processes = new Map<number, string[]>();
beforeEach(() => {
  vi.resetAllMocks();
  processes.clear();
  mocks.children.mockImplementation(async (pid: number) => pid === 10 ? [20] : pid === 20 ? [30] : []);
  mocks.args.mockImplementation(async (pid: number) => processes.get(pid)?.join(' ') ?? null);
  mocks.argv.mockImplementation(async ({ pid }: { pid: number }) => processes.get(pid) ?? []);
  mocks.cwd.mockResolvedValue('/repo');
  mocks.readdir.mockResolvedValue([]);
  mocks.realpath.mockImplementation(async (file: string) => file);
});

describe('agent provider identity', () => {
  it.each([
    ['claude', '/pkg/@anthropic-ai/claude-code/cli.js'],
    ['codex', '/pkg/@openai/codex/bin/codex.js'],
  ])('recognizes the npm bin symlink for %s', async (provider, target) => {
    processes.set(20, ['node', `/npm/bin/${provider}`]);
    mocks.realpath.mockResolvedValue(target);
    expect(await isClaudeRunning(10)).toBe(provider === 'claude');
    expect(await isCodexRunning(10)).toBe(provider === 'codex');
  });

  it('does not infer a provider from an unreadable script alias', async () => {
    processes.set(20, ['node', '/npm/bin/claude', 'codex']);
    mocks.realpath.mockRejectedValue(new Error('gone'));
    expect(await isClaudeRunning(10)).toBe(false);
    expect(await isCodexRunning(10)).toBe(false);
  });

  it.each([
    ['/vendor/codex', '-c', 'developer_instructions="Use claude-code or codex-cli tabs"'],
    ['node', '/pkg/@openai/codex/bin/codex.js', 'Ask claude for help'],
  ])('keeps Codex in check-agent when its arguments mention Claude: %j', async (...argv) => {
    processes.set(20, argv);
    processes.set(30, ['rg', 'claude', '/repo']);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ method: 'GET', query: { session: 'codex-tab' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ running: true, providerId: 'codex', providerPanelType: 'codex-cli' }));
    expect(await detectCodex(10)).toMatchObject({ status: 'running', pid: 20 });
  });

  it.each([
    ['sh', '-c', 'claude --resume 11111111-1111-4111-8111-111111111111'],
    ['rg', 'claude codex'],
    ['node', '/repo/claude-codex/server.js', 'claude'],
    ['node', '-e', 'launch("claude", "codex")'],
    ['/repo/claude-codex/python', 'codex'],
  ])('ignores agent names in unrelated processes: %j', async (...argv) => {
    processes.set(20, argv);
    expect(await isClaudeRunning(10)).toBe(false);
    expect(await isCodexRunning(10)).toBe(false);
    expect(await detectClaude(10)).toMatchObject({ status: 'not-running', sessionId: null });
    expect(await detectCodex(10)).toMatchObject({ status: 'not-running', sessionId: null });
  });

  it('rejects a stale Claude PID registration now owned by Codex', async () => {
    processes.set(20, ['codex', 'claude']);
    mocks.readdir.mockResolvedValue(['active.json']);
    mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 20, sessionId: 'old-claude', cwd: '/repo' }));
    expect(await detectClaude(10)).toMatchObject({ status: 'not-running', sessionId: null });
  });

  it.each([
    ['claude', 'codex'],
    ['/opt/claude', 'codex'],
    ['node', '/pkg/@anthropic-ai/claude-code/cli.js', 'codex'],
    ['bun', '/pkg/@anthropic-ai/claude-code/claude.js', 'codex'],
  ])('recognizes real Claude without claiming Codex: %j', async (...argv) => {
    processes.set(20, ['sh']);
    processes.set(30, argv);
    expect(await isClaudeRunning(10)).toBe(true);
    expect(await isCodexRunning(10)).toBe(false);
  });
});
