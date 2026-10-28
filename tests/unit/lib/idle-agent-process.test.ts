import { beforeEach, describe, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { ISystemProcess } from '@/lib/process-utils';
import { CODEX_LAUNCHER_SCRIPT } from '@/lib/providers/codex/launcher-path';
import { CLAUDE_LAUNCHER_BOOTSTRAP, CLAUDE_LAUNCHER_SCRIPT } from '@/lib/providers/claude/launcher';

const m = vi.hoisted(() => ({ argv: vi.fn(), realpath: vi.fn() }));
vi.mock('@/lib/process-utils', () => ({ getProcessArgv: m.argv }));
vi.mock('fs/promises', () => ({ default: { realpath: m.realpath } }));
import { idleAgentProcessChain } from '@/lib/idle-agent-process';

const legacyLauncherArgv = (script: string): string[] => {
  // b23d9ff6^ generated the inline command this way, including its shell quoting.
  const quote = (value: string) => "'" + value.replace(/['\\]/g,
    (character) => character === "'" ? "'\\''" : "'\\\\'") + "'";
  const command = ['node', '-e', script.trim().replace(/\n\s*/g, ' '), '--', '--resume', 'session']
    .map(quote).join(' ');
  return execFileSync('bash', ['-c', `set -- ${command}; printf '%s\\0' "$@"`], { encoding: 'utf8' })
    .split('\0').slice(0, -1);
};

const chain = (...argv: string[][]): ISystemProcess[] => {
  m.argv.mockImplementation(async (item) => argv[item.pid - 1]);
  return argv.map((args, index) => ({ pid: index + 1, ppid: index, uid: 1000,
    args: args.join(' '), startedAt: '2026-10-19T00:00:00Z' }));
};
beforeEach(() => {
  vi.resetAllMocks();
  m.realpath.mockImplementation(async (file) => file);
});

describe('idle Agent process chains using actual identities', () => {
  it('accepts the application Codex launcher followed by an npm bin link and native Agent', async () => {
    m.realpath.mockResolvedValue('/pkg/@openai/codex/bin/codex.js');
    const rows = chain(['bash'], ['node', CODEX_LAUNCHER_SCRIPT], ['node', '/npm/bin/codex'], ['/vendor/codex']);
    expect(await idleAgentProcessChain(1, rows, 'codex')).toEqual(rows);
  });
  it.each([CLAUDE_LAUNCHER_BOOTSTRAP, CLAUDE_LAUNCHER_SCRIPT])('accepts the exact Claude launcher and its shell fallback', async (script) => {
    m.realpath.mockResolvedValue('/pkg/@anthropic-ai/claude-code/cli.js');
    const rows = chain(['zsh'], ['node', '-e', script, '--'], ['bash', '-ilc', 'claude'], ['node', '/npm/bin/claude']);
    expect(await idleAgentProcessChain(1, rows, 'claude')).toEqual(rows);
  });
  it('accepts argv produced by the historical single-line command generator', async () => {
    const argv = legacyLauncherArgv(CLAUDE_LAUNCHER_SCRIPT);
    expect(argv[2]).not.toContain('\n');
    expect(argv[2]).not.toBe(CLAUDE_LAUNCHER_SCRIPT);
    const rows = chain(['bash'], argv, ['claude']);
    expect(await idleAgentProcessChain(1, rows, 'claude')).toEqual(rows);
  });
  it.each(['node', 'nodejs', 'bun'])('rejects independent descendants of an actual %s Claude Agent', async (runtime) => {
    m.realpath.mockResolvedValue('/pkg/@anthropic-ai/claude-code/cli.js');
    const rows = chain(['bash'], ['node', '-e', CLAUDE_LAUNCHER_BOOTSTRAP],
      [runtime, '/npm/bin/claude'], ['claude']);
    expect(await idleAgentProcessChain(1, rows, 'claude')).toBeNull();
  });
  it('rejects a Codex npm wrapper without a directly connected native Codex', async () => {
    let rows = chain(['bash'], ['node', '/pkg/@openai/codex/bin/codex.js']);
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
    rows = chain(['bash'], ['node', '/pkg/@openai/codex/bin/codex.js'], ['node', '/pkg/@openai/codex/bin/codex.js']);
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
  });
  it.each([
    ['node', '/tmp/codex-launcher.js'],
    ['node', '-e', 'spawn("codex")'],
    ['node', '-e', CLAUDE_LAUNCHER_BOOTSTRAP],
    ['node', '-e', CODEX_LAUNCHER_SCRIPT],
    ['node', '/npm/bin/codex'],
  ])('rejects unknown or mismatched wrappers: %j', async (...argv) => {
    const rows = chain(['bash'], argv, ['codex']);
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
  });
  it('rejects unreadable npm links, launcher-only chains and a different leaf provider', async () => {
    m.realpath.mockRejectedValue(new Error('unreadable'));
    let rows = chain(['bash'], ['node', '/npm/bin/codex'], ['codex']);
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
    rows = chain(['bash'], ['node', CODEX_LAUNCHER_SCRIPT]);
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
    rows = chain(['bash'], ['node', CODEX_LAUNCHER_SCRIPT], ['claude']);
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
  });
  it.each([['codex'], ['node', 'mcp-server.js'], ['sleep', '3600'], ['bash']])('protects descendants of a native Agent: %j', async (...argv) => {
    const rows = chain(['bash'], ['node', CODEX_LAUNCHER_SCRIPT], ['codex'], argv);
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
  });
  it('rejects branching at the launcher and cycles', async () => {
    const rows = chain(['bash'], ['node', CODEX_LAUNCHER_SCRIPT], ['codex'], ['codex']);
    rows[3].ppid = 2;
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
    rows[3].ppid = 3; rows[0].ppid = 1;
    expect(await idleAgentProcessChain(1, rows, 'codex')).toBeNull();
  });
});
