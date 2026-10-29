import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISystemProcess } from '@/lib/process-utils';
import { CODEX_LAUNCHER_SCRIPT } from '@/lib/providers/codex/launcher-path';
import { CLAUDE_LAUNCHER_BOOTSTRAP, CLAUDE_LAUNCHER_SCRIPT } from '@/lib/providers/claude/launcher';
import fs from 'fs/promises';
const m = vi.hoisted(() => ({ processes: vi.fn(), argv: vi.fn(), exec: vi.fn(), delay: vi.fn(),
  rows: [] as ISystemProcess[], terminal: true, events: [] as string[] }));
vi.mock('timers/promises', () => ({ setTimeout: m.delay }));
vi.mock('child_process', () => ({ execFile: m.exec }));
vi.mock('@/lib/process-utils', () => ({ listUserProcesses: m.processes, getProcessArgv: m.argv }));
import { stopIdleAgentChain } from '@/lib/idle-agent-shutdown';
import { killSession } from '@/lib/tmux';

const shell: ISystemProcess = { pid: 987001, ppid: 987000, uid: 1000, startedAt: '2026-10-19T00:00:00Z', args: 'bash' };
const agent: ISystemProcess = { ...shell, pid: 987002, ppid: shell.pid, args: 'codex' };
let kill: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  m.rows = [shell, agent]; m.terminal = true; m.events = [];
  m.processes.mockImplementation(async () => [...m.rows]);
  m.argv.mockImplementation(async (item) => item.args === 'node'
    ? ['node', '/pkg/@openai/codex/bin/codex.js'] : [item.args]);
  m.delay.mockResolvedValue(undefined);
  kill = vi.spyOn(process, 'kill').mockImplementation((pid) => {
    m.events.push('signal:' + pid);
    m.rows = m.rows.filter((item) => item.pid !== pid);
    return true;
  });
  m.exec.mockImplementation((_file, args, _options, callback) => {
    const command = args[2];
    if (command === 'kill-session') {
      m.events.push('destroy-tmux');
      m.terminal = false;
      m.rows = [];
    }
    let output = '';
    if (command === 'display-message') output = String(shell.pid);
    queueMicrotask(() => callback(command === 'has-session' && !m.terminal ? new Error('absent') : null, { stdout: output, stderr: '' }));
    return {};
  });
});
afterEach(() => vi.restoreAllMocks());

describe('graceful idle Agent shutdown before tmux destruction', () => {
  it('waits for Agent exit before destroying tmux and never signals the shell during the wait', async () => {
    let polls = 0;
    kill.mockImplementation((pid: number) => { m.events.push('signal:' + pid); return true; });
    m.delay.mockImplementation(async () => {
      expect(m.terminal).toBe(true);
      expect(kill).toHaveBeenCalledExactlyOnceWith(agent.pid, 'SIGTERM');
      if (++polls === 2) { m.rows = [shell]; m.events.push('agent-exited'); }
    });
    await killSession('terminal', () => stopIdleAgentChain([shell, agent], 'codex'));
    expect(m.events.indexOf('agent-exited')).toBeLessThan(m.events.indexOf('destroy-tmux'));
    expect(kill).toHaveBeenCalledWith(-shell.pid, 'SIGTERM');
    expect(m.terminal).toBe(false);
  });
  it('keeps the actual tmux session and shell when an Agent ignores SIGTERM', async () => {
    kill.mockImplementation(() => true);
    await expect(killSession('terminal', () => stopIdleAgentChain([shell, agent], 'codex'))).rejects.toThrow('not stopped');
    expect(kill).toHaveBeenCalledExactlyOnceWith(agent.pid, 'SIGTERM');
    expect(m.terminal).toBe(true);
    expect(m.rows).toEqual([shell, agent]);
    expect(m.events).not.toContain('destroy-tmux');
  });
  it('also waits for a Node launcher to exit after the native Agent exits', async () => {
    const launcher = { ...agent, args: 'node' };
    const native = { ...agent, pid: 987003, ppid: launcher.pid };
    m.rows = [shell, launcher, native];
    await expect(killSession('terminal', () => stopIdleAgentChain([shell, launcher, native], 'codex'))).rejects.toThrow('not stopped');
    expect(kill).toHaveBeenCalledExactlyOnceWith(native.pid, 'SIGTERM');
    expect(m.terminal).toBe(true);
    expect(m.rows).toEqual([shell, launcher]);
  });
  it.each(['codex', 'claude'] as const)('waits for the application %s launcher after signaling only the native Agent', async (provider) => {
    const launcher = { ...agent, args: 'node' };
    const native = { ...agent, pid: 987003, ppid: launcher.pid, args: provider };
    const argv = provider === 'codex' ? ['node', CODEX_LAUNCHER_SCRIPT]
      : ['node', '-e', CLAUDE_LAUNCHER_BOOTSTRAP, '--'];
    m.argv.mockImplementation(async (item) => item.pid === launcher.pid ? argv : [item.args]);
    m.rows = [shell, launcher, native];
    m.delay.mockImplementation(async () => {
      expect(m.terminal).toBe(true);
      expect(kill).toHaveBeenCalledExactlyOnceWith(native.pid, 'SIGTERM');
      m.rows = [shell];
      m.events.push('launcher-exited');
    });
    await killSession('terminal', () => stopIdleAgentChain([shell, launcher, native], provider));
    expect(m.events.indexOf('launcher-exited')).toBeLessThan(m.events.indexOf('destroy-tmux'));
  });
  it('retains tmux when the application launcher survives the native Agent', async () => {
    const launcher = { ...agent, args: 'node' };
    const native = { ...agent, pid: 987003, ppid: launcher.pid };
    m.argv.mockImplementation(async (item) => item.pid === launcher.pid ? ['node', CODEX_LAUNCHER_SCRIPT] : [item.args]);
    m.rows = [shell, launcher, native];
    await expect(killSession('terminal', () => stopIdleAgentChain([shell, launcher, native], 'codex'))).rejects.toThrow('not stopped');
    expect(kill).toHaveBeenCalledExactlyOnceWith(native.pid, 'SIGTERM');
    expect(m.rows).toEqual([shell, launcher]);
    expect(m.terminal).toBe(true);
  });
  it('rejects a launcher-only chain without signaling anything', async () => {
    const launcher = { ...agent, args: 'node' };
    m.argv.mockImplementation(async (item) => item.pid === launcher.pid ? ['node', CODEX_LAUNCHER_SCRIPT] : [item.args]);
    await expect(stopIdleAgentChain([shell, launcher], 'codex')).rejects.toThrow('identity changed');
    expect(kill).not.toHaveBeenCalled();
  });
  it('never signals an independent child of a Node Claude Agent behind the application launcher', async () => {
    const launcher = { ...agent, args: 'node launcher' };
    const main = { ...agent, pid: 987003, ppid: launcher.pid, args: 'node /npm/bin/claude' };
    const child = { ...agent, pid: 987004, ppid: main.pid, args: 'claude' };
    vi.spyOn(fs, 'realpath').mockResolvedValue('/pkg/@anthropic-ai/claude-code/cli.js');
    m.argv.mockImplementation(async (item) => item.pid === launcher.pid
      ? ['node', '-e', CLAUDE_LAUNCHER_BOOTSTRAP]
      : item.pid === main.pid ? ['node', '/npm/bin/claude'] : [item.args]);
    m.rows = [shell, launcher, main, child];
    await expect(killSession('terminal', () => stopIdleAgentChain(m.rows, 'claude'))).rejects.toThrow('identity changed');
    expect(kill).not.toHaveBeenCalled();
    expect(m.terminal).toBe(true);
    expect(m.events).not.toContain('destroy-tmux');
  });
  it('stops the actual Node Claude leaf behind a historical single-line launcher', async () => {
    const launcher = { ...agent, args: 'node launcher' };
    const main = { ...agent, pid: 987003, ppid: launcher.pid, args: 'node /npm/bin/claude' };
    vi.spyOn(fs, 'realpath').mockResolvedValue('/pkg/@anthropic-ai/claude-code/cli.js');
    m.argv.mockImplementation(async (item) => item.pid === launcher.pid
      ? ['node', '-e', CLAUDE_LAUNCHER_SCRIPT.trim().replace(/\n\s*/g, ' ')]
      : item.pid === main.pid ? ['node', '/npm/bin/claude'] : [item.args]);
    m.rows = [shell, launcher, main];
    m.delay.mockImplementation(async () => { m.rows = [shell]; });
    await stopIdleAgentChain([shell, launcher, main], 'claude');
    expect(kill).toHaveBeenCalledExactlyOnceWith(main.pid, 'SIGTERM');
  });
  it('preserves the terminal if a new child starts during shutdown', async () => {
    m.delay.mockImplementation(async () => { m.rows.push({ ...agent, pid: 987003, args: 'build' }); });
    kill.mockImplementation(() => true);
    await expect(killSession('terminal', () => stopIdleAgentChain([shell, agent], 'codex'))).rejects.toThrow('tree changed');
    expect(m.terminal).toBe(true);
    expect(m.events).not.toContain('destroy-tmux');
  });
  it('does not signal a reused PID or destroy tmux if process queries fail', async () => {
    m.rows = [shell, { ...agent, startedAt: '2026-10-20T00:00:00Z' }];
    await expect(stopIdleAgentChain([shell, agent], 'codex')).rejects.toThrow('tree changed');
    expect(kill).not.toHaveBeenCalled();
    m.rows = [shell, agent];
    m.processes.mockResolvedValueOnce([shell, agent]).mockRejectedValueOnce(new Error('query failed'));
    await expect(killSession('terminal', () => stopIdleAgentChain([shell, agent], 'codex'))).rejects.toThrow('query failed');
    expect(m.terminal).toBe(true);
    expect(m.events).not.toContain('destroy-tmux');
  });
  it('does not destroy a replacement tmux pane after the graceful shutdown callback', async () => {
    await expect(killSession('terminal', async () => {
      m.exec.mockImplementation((_file, args, _options, callback) => {
        queueMicrotask(() => callback(null, { stdout: args[2] === 'display-message' ? '987999' : '', stderr: '' }));
        return {};
      });
    })).rejects.toThrow('pane changed');
    expect(kill).not.toHaveBeenCalled();
    expect(m.terminal).toBe(true);
  });
});
