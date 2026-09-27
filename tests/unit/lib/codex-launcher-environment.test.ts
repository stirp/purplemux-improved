import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }) }));
import { CODEX_LAUNCHER_SCRIPT_CONTENT } from '@/lib/providers/codex';

const runLauncher = async (response: object, argv: string[] = [], help: string | Error = '') => {
  const spawn = vi.fn(() => ({ on: vi.fn() }));
  const execFileSync = vi.fn(() => {
    if (help instanceof Error) throw help;
    return help;
  });
  const exit = vi.fn();
  const fetch = vi.fn(async (_url: string, _options: { body: string }) => ({ ok: true, json: async () => response }));
  const inherited = { PATH: '/bin', HTTPS_PROXY: 'inherited', KEEP: 'yes' };
  vm.runInNewContext(CODEX_LAUNCHER_SCRIPT_CONTENT, {
    require: (name: string) => {
      if (name === 'node:child_process') return { spawn, execFileSync };
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
  return { spawn, exit, fetch, inherited, execFileSync };
};

describe('Codex launcher environment', () => {
  it.each([['-c', 'hooks.Stop=[]'], ['resume', 'session', '-c', 'hooks.Stop=[]']])(
    'explicitly selects embedded mode when supported: %j', async (...args) => {
      const env = { PATH: '/custom/bin' };
      const { spawn, execFileSync } = await runLauncher({ args: [...args], env }, [], '  --no-daemon  Run without the shared background server');
      expect(spawn).toHaveBeenCalledWith('codex', ['--no-daemon', ...args], expect.any(Object));
      expect(execFileSync).toHaveBeenCalledWith('codex', ['--help'], expect.objectContaining({
        env: expect.objectContaining(env), timeout: 5000,
      }));
    },
  );

  it('still launches when the capability probe fails', async () => {
    const { spawn } = await runLauncher({ args: ['-c', 'hooks.Stop=[]'] }, [], new Error('timeout'));
    expect(spawn).toHaveBeenCalledWith('codex', ['-c', 'hooks.Stop=[]'], expect.any(Object));
  });

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
