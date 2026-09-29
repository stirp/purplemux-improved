import path from 'node:path';
import { existsSync } from 'node:fs';
import type { Writable } from 'node:stream';
import vm from 'node:vm';
import { execFileSync, spawn as spawnProcess } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { isValidAgentEnvironment, MAX_AGENT_CONFIG_BYTES } from '@/lib/agent-environment';
import { CLAUDE_LAUNCHER_SCRIPT, buildClaudeLauncherCommand } from '@/lib/providers/claude/launcher';
import { buildClaudeLaunchCommand } from '@/lib/providers/claude/client';
vi.mock('@/lib/config-store', () => ({ getDangerouslySkipPermissions: async () => true }));
vi.mock('@/lib/hook-settings', () => ({ HOOK_SETTINGS_PATH: '/home/test dir/hooks.json' }));
vi.mock('@/lib/claude-prompt', () => ({ getClaudePromptPath: (id: string) => `/home/test dir/${id}/claude-prompt.md` }));
import { buildClaudeArgs, buildResumeCommand } from '@/lib/claude-command';

const run = (config: unknown, args: string[] = [], shell?: string, size?: number) => {
  const bytes = Buffer.from(JSON.stringify(config) ?? "null");
  let offset = 0;
  const read = vi.fn((_fd: number, buffer: Buffer, start: number, length: number) => {
    const count = bytes.copy(buffer, start, offset, offset + length);
    offset += count;
    return count;
  });
  const close = vi.fn();
  const error = vi.fn();
  const spawn = vi.fn(() => ({ kill: vi.fn(), stdio: [null, null, null, { on: vi.fn(), end: vi.fn(), destroy: vi.fn() }, { on: vi.fn(), destroy: vi.fn() }], on: vi.fn<(event: string, callback: (error: { code: string }) => void) => void>() }));
  const exit = vi.fn();
  const timer = vi.fn<(callback: () => void, ms: number) => number>(() => 1);
  const clearTimer = vi.fn();
  const probe = vi.fn((file: string) => file.includes('fish') ? '/usr/bin/fish' : '');
  const inherited = { PATH: '/bin', SHARED: 'inherited', KEEP: 'yes', ...(shell ? { SHELL: shell } : {}) };
  vm.runInNewContext(CLAUDE_LAUNCHER_SCRIPT, {
    require: (name: string) => {
      if (name === 'node:fs') return { openSync: () => {
        if (config instanceof Error) throw config;
        return 7;
      }, fstatSync: () => ({ size: size ?? bytes.length, isFile: () => true }), readSync: read, closeSync: close };
      if (name === 'node:path') return { join: (...parts: string[]) => parts.join('/'), basename: path.basename };
      if (name === 'node:os') return { homedir: () => '/test' };
      if (name === 'node:child_process') return { spawn, execFileSync: probe };
      throw new Error(name);
    },
    process: { argv: ['node', ...args], env: inherited, exit },
    console: { error },
    Buffer,
    setTimeout: timer,
    clearTimeout: clearTimer,
  });
  return { spawn, exit, inherited, read, close, error, timer, clearTimer, probe };
};

describe('Claude environment launcher', () => {
  it.each([[], ['--resume', 'session']])('isolates overrides for launch/resume: %j', (...args) => {
    const env = { SHARED: 'claude', TOKEN: "a=b; $HOME ' $(whoami)\nnext", EMPTY: '' };
    const { spawn, inherited } = run({ claudeEnvironment: env, codexEnvironment: { SHARED: 'codex', CODEX_ONLY: 'secret' } }, args);
    expect(spawn).toHaveBeenCalledWith('claude', args, {
      stdio: 'inherit', env: { PATH: '/bin', KEEP: 'yes', ...env },
    });
    expect(inherited.SHARED).toBe('inherited');
  });

  it.each([{}, { claudeEnvironment: {} }, Object.assign(new Error('missing'), { code: 'ENOENT' })])('inherits when configuration is absent or cleared', (config) => {
    const { spawn, inherited } = run(config);
    expect(spawn).toHaveBeenCalledWith('claude', [], { stdio: 'inherit', env: inherited });
  });

  it.each([[], { INVALID: 1 }, { 'BAD=NAME': 'value' }, { TOKEN: '\0' }])('rejects malformed overrides', (env) => {
    const { spawn, exit } = run({ claudeEnvironment: env });
    expect(spawn).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('fails on unreadable configuration', () => {
    const { spawn, exit } = run(new Error('unreadable'));
    expect(spawn).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('preserves shell-function fallback and passes overrides without exposing them in the command', () => {
    const { spawn } = run({ claudeEnvironment: { TOKEN: 'secret' } }, ['--resume', "a'b"]);
    const errorHandler = spawn.mock.results[0].value.on.mock.calls.find(([event]: [string, unknown]) => event === 'error')![1];
    errorHandler({ code: 'ENOENT' });
    expect(spawn).toHaveBeenLastCalledWith('/bin/sh', ['-ilc', expect.stringContaining("claude '--resume' 'a'\\''b'")], {
      stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe'], env: { PATH: '/bin', SHARED: 'inherited', KEEP: 'yes', TOKEN: 'secret' },
    });
    expect(spawn.mock.results[1].value.stdio[3]!.end).toHaveBeenCalledWith(expect.stringContaining("export TOKEN='secret'"), expect.any(Function));

  });

  it.each(['/bin/sh', '/bin/bash', '/usr/bin/zsh', '/usr/bin/fish'].filter(existsSync))(
    'applies literal overrides after initialization in %s without consuming terminal input', async (shell) => {
      const env = { SHARED: 'configured', HTTPS_PROXY: 'http://configured-proxy:7890', SPECIAL: "a=b; $HOME ' \\ $(whoami)\nnext\n", EMPTY: '' };
      for (const overrides of [env, {}]) {
        const args = ['--resume', "a'b\\c; $HOME $(printf injected) `printf injected`", '--append-system-prompt-file', 'workspace with spaces/$HOME/`printf injected`/$(printf injected)'];
        const { spawn } = run({ claudeEnvironment: overrides }, args, shell);
        const errorHandler = spawn.mock.results[0].value.on.mock.calls.find(([event]: [string, unknown]) => event === 'error')![1];
        errorHandler({ code: 'ENOENT' });
        const [, [, command]] = spawn.mock.calls[1] as unknown as [string, string[]];
        const assignments = spawn.mock.results[1].value.stdio[3]!.end.mock.calls[0][0];
        expect(command).not.toContain(env.SPECIAL);
        expect(command).not.toContain(env.SHARED);
        const fish = shell.endsWith('/fish');
        const probe = 'console.log(JSON.stringify({ shared: process.env.SHARED, proxy: process.env.HTTPS_PROXY, special: process.env.SPECIAL, empty: process.env.EMPTY, args: process.argv.slice(1), stdin: require("node:fs").readFileSync(0, "utf8") }))';
        const invoke = `'${process.execPath}' -e '${probe}' -- ${fish ? '$argv' : '"$@"'}`;
        const initialize = fish
          ? `set -gx SHARED initialization; set -e HTTPS_PROXY; function claude; ${invoke}; end; `
          : `export SHARED=initialization; unset HTTPS_PROXY; claude() { ${invoke}; }; `;
        const flags = fish ? ['--no-config'] : shell.endsWith('/zsh') ? ['-f'] : shell.endsWith('/bash') ? ['--noprofile', '--norc'] : [];
        const child = spawnProcess(shell, [...flags, '-c', initialize + command], {
          env: { PATH: '/bin', SHARED: 'inherited', HTTPS_PROXY: 'http://inherited-proxy:7890', ...overrides, NODE_ENV: 'test' }, stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdio[4]!.on('data', () => {});
        child.stdout!.on('data', (data) => { stdout += data; });
        child.stderr!.on('data', (data) => { stderr += data; });
        const completion = new Promise<void>((resolve, reject) => {
          child.on('error', reject);
          child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr)));
          child.stdio[3]!.on('error', reject);
        });
        (child.stdio[3] as Writable).end(assignments, () => (child.stdio[3] as Writable).destroy());
        child.stdin!.end('terminal input');
        await completion;
        expect(JSON.parse(stdout)).toEqual({
          shared: 'SHARED' in overrides ? env.SHARED : 'initialization',
          ...('SPECIAL' in overrides ? { proxy: env.HTTPS_PROXY, special: env.SPECIAL, empty: '' } : {}),
          args, stdin: 'terminal input',
        });
      }
    },
  );

  it('preserves the script and arguments through shell quoting', () => {
    const command = buildClaudeLauncherCommand(['--resume', 'session', '--settings', '/tmp/hooks.json']);
    const output = execFileSync('/bin/sh', ['-c', `node() { printf '%s\\n' "$@"; }; ${command}`], { encoding: 'utf8' });
    const [flag, script, separator, ...args] = output.trim().split('\n');
    expect(flag).toBe('-e');
    expect(script).toBe(CLAUDE_LAUNCHER_SCRIPT.trim().replace(/\n\s*/g, ' '));
    expect(separator).toBe('--');
    expect(args).toEqual(['--resume', 'session', '--settings', '/tmp/hooks.json']);
  });

  it('expands only path option home prefixes inside Node', () => {
    const { spawn } = run({}, ['--resume', '~/literal', '--settings', '~/.purplemux/hooks.json', '--append-system-prompt-file', '~/.purplemux/workspaces/a b/claude-prompt.md']);
    expect(spawn).toHaveBeenCalledWith('claude', [
      '--resume', '~/literal', '--settings', '/test/.purplemux/hooks.json',
      '--append-system-prompt-file', '/test/.purplemux/workspaces/a b/claude-prompt.md',
    ], expect.any(Object));
  });

  it.each(['/bin/sh', '/bin/bash', '/usr/bin/zsh', '/usr/bin/fish'].filter(existsSync))(
    'preserves the outer script and user arguments through %s', async (shell) => {
      const input = "a'b\\c; $HOME $(printf injected) `printf injected`\nnext";
      const sessionId = '12345678-1234-1234-1234-123456789abc';
      const serverArgs = await buildClaudeArgs(input);
      expect(serverArgs).toEqual(['--settings', '/home/test dir/hooks.json', '--append-system-prompt-file', `/home/test dir/${input}/claude-prompt.md`, '--dangerously-skip-permissions']);
      const cases: [string, string[]][] = [
        [buildClaudeLaunchCommand({ workspaceId: input, resumeSessionId: input }), ['--resume', input, '--settings', '~/.purplemux/hooks.json', '--append-system-prompt-file', `~/.purplemux/workspaces/${input}/claude-prompt.md`]],
        [await buildResumeCommand(sessionId, input), ['--resume', sessionId, ...serverArgs]],
      ];
      const fish = shell.endsWith('/fish');
      const invoke = `command '${process.execPath}' -e 'console.log(JSON.stringify(process.argv.slice(1)))' -- ${fish ? '$argv' : '"$@"'}`;
      const capture = fish ? `function node; ${invoke}; end; ` : `node() { ${invoke}; }; `;
      const flags = fish ? ['--no-config'] : shell.endsWith('/zsh') ? ['-f'] : shell.endsWith('/bash') ? ['--noprofile', '--norc'] : [];
      for (const [command, args] of cases) {
        const output = execFileSync(shell, [...flags, '-c', capture + command], { encoding: 'utf8' });
        expect(JSON.parse(output)).toEqual(['-e', CLAUDE_LAUNCHER_SCRIPT.trim().replace(/\n\s*/g, ' '), '--', ...args]);
      }
    },
  );

  it('uses the shared launcher from browser launch and resume commands', () => {
    expect(buildClaudeLaunchCommand({})).toBe(buildClaudeLauncherCommand(['--settings', '~/.purplemux/hooks.json']));
    expect(buildClaudeLaunchCommand({ resumeSessionId: 'session', dangerouslySkipPermissions: true }))
      .toBe(buildClaudeLauncherCommand(['--resume', 'session', '--settings', '~/.purplemux/hooks.json', '--dangerously-skip-permissions']));
  });
});


it.each([null, [], 'text', 42, false])('rejects non-object config roots with a specific error: %j', (config) => {
  const { spawn, exit, error, close } = run(config);
  expect(spawn).not.toHaveBeenCalled();
  expect(exit).toHaveBeenCalledWith(1);
  expect(error).toHaveBeenCalledWith('Agent config.json must contain a JSON object');
  expect(close).toHaveBeenCalledWith(7);
});

it('rejects oversized configuration before reading its contents', () => {
  const { spawn, read, close, error } = run({}, [], undefined, MAX_AGENT_CONFIG_BYTES + 1);
  expect(read).not.toHaveBeenCalled();
  expect(spawn).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledWith(7);
  expect(error).toHaveBeenCalledWith('Agent config.json exceeds the 4 MiB size limit');
});

it('bounds reads even when the file grows after stat', () => {
  const { spawn, read, close, error } = run({ padding: 'x'.repeat(MAX_AGENT_CONFIG_BYTES + 10) }, [], undefined, 2);
  expect(read.mock.calls[0][3]).toBe(MAX_AGENT_CONFIG_BYTES + 1);
  expect(spawn).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledWith(7);
  expect(error).toHaveBeenCalledWith('Agent config.json exceeds the 4 MiB size limit');
});

it.each([null, [], { bad: 4 }, { lower_case: 'yes', EMPTY: '' }, { NAME: '\0' }, { 'BAD-NAME': 'no' }])('uses the shared API environment validator: %j', (env) => {
  const { spawn } = run({ claudeEnvironment: env });
  expect(spawn.mock.calls.length > 0).toBe(isValidAgentEnvironment(env));
});

const triggerFallback = (result: ReturnType<typeof run>) => {
  const handler = result.spawn.mock.results[0].value.on.mock.calls.find(([event]: [string, unknown]) => event === 'error')![1];
  handler({ code: 'ENOENT' });
  return result.spawn.mock.results[1].value;
};

it('times out a stalled fallback and reports the failure', () => {
  const result = run({ claudeEnvironment: { KEY: 'value' } });
  const fallback = triggerFallback(result);
  expect(result.timer.mock.calls[0][1]).toBe(120000);
  fallback.stdio[3]!.end.mock.calls[0][1]();
  expect(result.clearTimer).not.toHaveBeenCalled();
  result.timer.mock.calls[0][0]();
  expect(fallback.kill).toHaveBeenCalledWith('SIGKILL');
  expect(fallback.stdio[3]!.destroy).toHaveBeenCalled();
  expect(result.error).toHaveBeenCalledWith(expect.stringContaining('Timed out'));
  expect(result.exit).toHaveBeenCalledWith(1);
});

it('waits for a complete environment acknowledgment before clearing the timeout', () => {
  const result = run({});
  const fallback = triggerFallback(result);
  const data = fallback.stdio[4]!.on.mock.calls.find(([event]: [string, unknown]) => event === 'data')![1];
  data(Buffer.from('purplemux-'));
  expect(result.clearTimer).not.toHaveBeenCalled();
  data(Buffer.from('ready'));
  expect(result.clearTimer).toHaveBeenCalledWith(1);
  expect(result.exit).not.toHaveBeenCalled();
});

it('detects fish behavior even when the executable has another name', () => {
  const result = run({}, [], '/custom/renamed-shell');
  result.probe.mockReturnValue('/usr/bin/fish');
  triggerFallback(result);
  expect(result.probe).toHaveBeenCalledWith('/custom/renamed-shell', ['-c', 'status fish-path'], expect.objectContaining({ timeout: 5000 }));
  expect((result.spawn.mock.calls[1] as unknown as [string, string[]])[1][1]).toContain('| source');
});

it.each(['/bin/sh', '/bin/bash', '/usr/bin/zsh', '/usr/bin/fish'].filter(existsSync))(
  'fails closed on empty, truncated or broken fd 3 input in %s', async (shell) => {
    for (const mode of ['empty', 'truncated', 'closed']) {
      const result = run({ claudeEnvironment: { KEY: 'value' } }, [], shell);
      const fallback = triggerFallback(result);
      const [, [, generated]] = result.spawn.mock.calls[1] as unknown as [string, string[]];
      const command = mode === 'closed' ? generated.replace('/bin/cat <&3', '/bin/cat <&9') : generated;
      const fish = shell.endsWith('/fish');
      const definition = fish ? 'function claude; printf UNEXPECTED_CLAUDE; end; ' : 'claude() { printf UNEXPECTED_CLAUDE; }; ';
      const flags = fish ? ['--no-config'] : shell.endsWith('/zsh') ? ['-f'] : shell.endsWith('/bash') ? ['--noprofile', '--norc'] : [];
      const child = spawnProcess(shell, [...flags, '-c', definition + command], { stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe'] });
      let output = '';
      let error = '';
      let acknowledgment = '';
      child.stdout!.on('data', (data) => { output += data; });
      child.stderr!.on('data', (data) => { error += data; });
      child.stdio[4]!.on('data', (data) => { acknowledgment += data; });
      child.stdio[3]!.on('error', () => {});
      const completed = new Promise<number | null>((resolve, reject) => {
        child.on('error', reject);
        child.on('close', resolve);
      });
      const payload = mode === 'empty' ? '' : mode === 'truncated'
        ? (fish ? 'true; set -gx KEY value;' : 'export KEY=value;')
        : fallback.stdio[3]!.end.mock.calls[0][0];
      (child.stdio[3] as Writable).end(payload, () => (child.stdio[3] as Writable).destroy());
      expect(await completed).toBe(1);
      expect(output).toBe('');
      expect(acknowledgment).toBe('');
      expect(error).toContain('Failed to apply Claude environment from fd 3');
    }
  },
);

it('does not treat a signal-zero health probe as a child exit', async () => {
  const child = spawnProcess(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 100)']);
  const exit = vi.fn();
  child.on('exit', exit);
  const completed = new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  process.kill(child.pid!, 0);
  expect(exit).not.toHaveBeenCalled();
  expect(await completed).toBe(0);
  expect(exit).toHaveBeenCalledWith(0, null);
});
