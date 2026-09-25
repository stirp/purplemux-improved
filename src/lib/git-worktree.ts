import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { IWorkspace } from '@/types/terminal';

const exec = promisify(execFile);
const git = async (cwd: string, args: string[]) => {
  const { stdout } = await exec('git', ['-C', cwd, ...args], {
    timeout: 60_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout.trim();
};

export const worktreeDirectoryName = (branch: string) => branch.replace(/[/\\]/g, '-');

export const inspectWorktreeSource = async (workspace: IWorkspace, directoryIndex: number) => {
  const directory = workspace.directories[directoryIndex];
  if (!directory) throw new Error('Source directory not found');
  const repository = await git(directory, ['rev-parse', '--show-toplevel']);
  const [head, branch, status] = await Promise.all([
    git(repository, ['rev-parse', '--verify', 'HEAD^{commit}']),
    git(repository, ['symbolic-ref', '--quiet', '--short', 'HEAD']).catch(() => 'HEAD'),
    git(repository, ['status', '--porcelain']),
  ]);
  return { repository, head, branch, dirty: !!status,
    worktreeRoot: path.join(os.homedir(), '.purplemux', 'worktrees', workspace.id) };
};

export const createGitWorktree = async (workspace: IWorkspace, directoryIndex: number, branch: string, baseRef: string) => {
  const info = await inspectWorktreeSource(workspace, directoryIndex);
  if (!branch || branch.startsWith('-') || branch.length > 80) throw new Error('Invalid branch name');
  await git(info.repository, ['check-ref-format', `refs/heads/${branch}`]);
  const baseCommit = await git(info.repository, ['rev-parse', '--verify', '--end-of-options', `${baseRef}^{commit}`]);
  const directory = path.join(info.worktreeRoot, worktreeDirectoryName(branch));
  try {
    await fs.lstat(directory);
    throw new Error('Worktree directory already exists');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.mkdir(info.worktreeRoot, { recursive: true });
  // Never force, reset an existing branch, or alter the source checkout.
  await git(info.repository, ['worktree', 'add', '-b', branch, '--', directory, baseCommit]);
  return { directory, repository: info.repository, branch, baseCommit };
};
