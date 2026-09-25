import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exec: vi.fn(), access: vi.fn() }));

vi.mock('child_process', async () => {
  const { promisify } = await import('util');
  return { execFile: Object.assign(vi.fn(), { [promisify.custom]: mocks.exec }) };
});
vi.mock('fs/promises', () => ({ default: {}, access: mocks.access }));
vi.mock('@/lib/preflight', () => ({ getShellPath: async () => '/resolved/bin' }));
vi.mock('@/lib/shell-env', () => ({
  defaultShell: () => '/usr/bin/fish',
  buildShellEnv: () => ({ PATH: '/original/bin', HOME: '/home/test' }),
}));

import { runClaudePreflight } from '@/lib/providers/claude/preflight';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockRejectedValue(new Error('ENOENT'));
});

describe('Claude preflight', () => {
  it('detects a directly executable Claude without starting a shell', async () => {
    mocks.exec.mockResolvedValueOnce({ stdout: '2.1.206 (Claude Code)' });
    expect(await runClaudePreflight()).toMatchObject({ installed: true, version: '2.1.206', binaryPath: null });
    expect(mocks.exec).toHaveBeenCalledTimes(1);
    expect(mocks.exec).toHaveBeenCalledWith('claude', ['--version'], expect.objectContaining({
      env: expect.objectContaining({ PATH: '/resolved/bin' }),
    }));
  });

  it('detects Claude exposed as a function in the interactive login shell', async () => {
    mocks.exec.mockRejectedValueOnce(new Error('spawn claude ENOENT'));
    mocks.exec.mockResolvedValueOnce({ stdout: '2.1.206 (Claude Code)' });
    expect(await runClaudePreflight()).toMatchObject({ installed: true, version: '2.1.206', binaryPath: null });
    expect(mocks.exec).toHaveBeenLastCalledWith('/usr/bin/fish', ['-ilc', 'claude --version'], {
      timeout: 5000,
      env: {
        PATH: '/original/bin', HOME: '/home/test', SHELL: '/usr/bin/fish',
        DISABLE_AUTO_UPDATE: 'true', ZSH_TMUX_AUTOSTARTED: 'true',
      },
    });
  });

  it('reports missing when both execution methods fail and no known binary exists', async () => {
    mocks.exec.mockRejectedValue(new Error('not found'));
    expect(await runClaudePreflight()).toEqual({ installed: false, version: null, binaryPath: null, loggedIn: false });
  });

  it('preserves the PATH repair hint when a known binary exists but cannot run', async () => {
    mocks.exec.mockRejectedValue(new Error('not found'));
    mocks.access.mockResolvedValue(undefined);
    const result = await runClaudePreflight();
    expect(result.installed).toBe(false);
    expect(result.binaryPath).toMatch(/\.local\/bin$/);
  });
});
