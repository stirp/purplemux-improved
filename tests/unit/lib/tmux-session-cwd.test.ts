import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exec: vi.fn(), env: { HOME: '', SHELL: '/bin/sh' } }));
vi.mock('child_process', () => ({
  execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: mocks.exec }),
}));
vi.mock('@/lib/pristine-env', () => ({ PRISTINE_ENV: mocks.env }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), warn: vi.fn() }) }));

import { createSession, getSessionCwd, getSessionPanePid, getPaneCurrentCommand, capturePaneContent, killSession } from '@/lib/tmux';

describe.skipIf(process.env.PMUX_TEST_TMUX !== '1')('real tmux session cwd recovery', () => {
  let tempDir: string;
  let socket: string;
  let bootstrapCwd: string | undefined;
  const sessions: string[] = [];

  beforeAll(async () => {
    const { execFile } = await vi.importActual<typeof import('node:child_process')>('node:child_process');
    const { promisify } = await import('node:util');
    const exec = promisify(execFile);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-session-cwd-'));
    socket = path.join(tempDir, 'tmux.sock');
    mocks.env.HOME = tempDir;
    mocks.exec.mockImplementation((file: string, args: string[], options: { cwd?: string }) => {
      if (file !== 'tmux' || args[args.indexOf('-L') + 1] !== 'purple') {
        throw new Error('Unexpected command outside isolated tmux');
      }
      const isolatedArgs = [...args];
      isolatedArgs.splice(isolatedArgs.indexOf('-L'), 2, '-S', socket);
      return exec(file, isolatedArgs, { ...options, ...(bootstrapCwd ? { cwd: bootstrapCwd } : {}) });
    });
    const oldDir = path.join(tempDir, 'deleted-worktree');
    await fs.mkdir(oldDir);
    bootstrapCwd = oldDir;
    sessions.push('pt-cwd-seed');
    await createSession('pt-cwd-seed', 100, 24, oldDir);
    await vi.waitFor(async () => expect(await getSessionCwd('pt-cwd-seed')).toBe(oldDir));
    bootstrapCwd = undefined;
    await fs.rmdir(oldDir);
  });

  afterAll(async () => {
    for (const session of sessions.reverse()) await killSession(session);
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  });

  it.each(['project', "space ' quote $(touch INJECTION) ; &", 'project;', 'project;;', 'project\\;'])(
    'starts in %s despite the daemon having a deleted cwd', async (directory) => {
      const target = path.join(tempDir, directory);
      await fs.mkdir(target);
      const session = `pt-cwd-${sessions.length}`;
      sessions.push(session);
      await createSession(session, 100, 24, target);
      await expect.poll(() => getSessionCwd(session)).toBe(target);
      const { cwd } = mocks.exec.mock.calls.find(([, args]) => args.includes(session) && args.includes('new-session'))![2];
      expect(cwd).toBe('/');
      await expect(fs.stat(path.join(tempDir, 'INJECTION'))).rejects.toThrow();
    },
  );

  it.each(['relative-project', 'relative-project;'])('resolves %s from the application cwd', async (directory) => {
    const target = path.join(tempDir, directory);
    await fs.mkdir(target);
    const session = `pt-cwd-${sessions.length}`;
    sessions.push(session);
    const appCwd = process.cwd();
    try {
      process.chdir(tempDir);
      await createSession(session, 100, 24, directory);
    } finally {
      process.chdir(appCwd);
    }
    await expect.poll(() => getSessionCwd(session)).toBe(target);
  });

  it('uses HOME when no cwd is supplied', async () => {
    sessions.push('pt-cwd-home');
    await createSession('pt-cwd-home', 100, 24);
    await expect.poll(() => getSessionCwd('pt-cwd-home')).toBe(tempDir);
  });

  it('rejects a missing directory before invoking tmux', async () => {
    const calls = mocks.exec.mock.calls.length;
    await expect(createSession('pt-cwd-missing', 100, 24, path.join(tempDir, 'missing'))).rejects.toThrow();
    expect(mocks.exec).toHaveBeenCalledTimes(calls);
  });

  it('rejects a file as the working directory', async () => {
    const target = path.join(tempDir, 'file');
    await fs.writeFile(target, '');
    const calls = mocks.exec.mock.calls.length;
    await expect(createSession('pt-cwd-file', 100, 24, target)).rejects.toThrow();
    expect(mocks.exec).toHaveBeenCalledTimes(calls);
  });

  it.skipIf(process.platform !== 'linux')('starts a fresh daemon in / while the shell uses the project', async () => {
    const oldSocket = socket;
    socket = path.join(tempDir, 'fresh.sock');
    try {
      await createSession('pt-cwd-fresh', 100, 24, tempDir);
      await expect.poll(() => getSessionCwd('pt-cwd-fresh')).toBe(tempDir);
      const pid = await getSessionPanePid('pt-cwd-fresh');
      const status = await fs.readFile(`/proc/${pid}/status`, 'utf8');
      const daemonPid = /^PPid:\s+(\d+)/m.exec(status)![1];
      expect(await fs.readlink(`/proc/${daemonPid}/cwd`)).toBe('/');
    } finally {
      await killSession('pt-cwd-fresh');
      socket = oldSocket;
    }
  });

  it.skipIf(!process.env.PMUX_TEST_FISH)('starts fish without current_dir errors', async () => {
    mocks.env.SHELL = process.env.PMUX_TEST_FISH!;
    sessions.push('pt-cwd-fish');
    await createSession('pt-cwd-fish', 100, 24, tempDir);
    await expect.poll(() => getPaneCurrentCommand('pt-cwd-fish')).toBe('fish');
    await expect.poll(() => getSessionCwd('pt-cwd-fish')).toBe(tempDir);
    expect(await capturePaneContent('pt-cwd-fish')).not.toMatch(/current_dir\(\) failed|getcwd.*(?:failed|cannot)/);
  });
});
