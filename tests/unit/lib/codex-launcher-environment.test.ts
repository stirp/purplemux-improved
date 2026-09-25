import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }) }));
import { CODEX_LAUNCHER_SCRIPT_CONTENT } from '@/lib/providers/codex';

const runLauncher = async (response: object, argv: string[] = []) => {
  const spawn = vi.fn(() => ({ on: vi.fn() }));
  const exit = vi.fn();
  const fetch = vi.fn(async (_url: string, _options: { body: string }) => ({ ok: true, json: async () => response }));
  const inherited = { PATH: '/bin', HTTPS_PROXY: 'inherited', KEEP: 'yes' };
  vm.runInNewContext(CODEX_LAUNCHER_SCRIPT_CONTENT, {
    require: (name: string) => {
      if (name === 'node:child_process') return { spawn };
      if (name === 'node:fs') return { readFileSync: () => '1234' };
      if (name === 'node:os') return { homedir: () => '/tmp' };
      if (name === 'node:path') return { join: (...parts: string[]) => parts.join('/') };
      throw new Error(`Unexpected module: ${name}`);
    },
    process: { argv: ['node', 'launcher', ...argv], env: inherited, exit },
    console: { error: vi.fn() },
    fetch,
  });
  await vi.waitFor(() => expect(spawn.mock.calls.length + exit.mock.calls.length).toBeGreaterThan(0));
  return { spawn, exit, fetch, inherited };
};

describe('Codex launcher environment', () => {
  it.each([[], ['--resume-session-id', 'session']])('merges configured values for launch/resume: %j', async (...argv) => {
    const env = { HTTPS_PROXY: 'configured', TOKEN: 'a=b; $HOME', EMPTY: '' };
    const { spawn, inherited, fetch } = await runLauncher({ args: ['--test'], env }, argv);
    expect(spawn).toHaveBeenCalledWith('codex', ['--test'], {
      stdio: 'inherit', env: { PATH: '/bin', KEEP: 'yes', ...env },
    });
    expect(inherited.HTTPS_PROXY).toBe('inherited');
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.resumeSessionId).toBe(argv[1] ?? null);
  });

  it('inherits the environment when no overrides are configured', async () => {
    const { spawn, inherited } = await runLauncher({ args: [] });
    expect(spawn).toHaveBeenCalledWith('codex', [], { stdio: 'inherit', env: inherited });
  });

  it.each([{ NAME: 3 }, { 'BAD=NAME': 'x' }, { NAME: '\0' }, []])('rejects malformed environment: %j', async (env) => {
    const { spawn, exit } = await runLauncher({ args: [], env });
    expect(spawn).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });
});
