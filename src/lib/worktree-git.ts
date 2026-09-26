import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { IManagedWorktree, IWorktreeStatus } from '@/types/worktree';

const exec = promisify(execFile);
export const worktreeGit = async (cwd: string, args: string[], timeout = 15_000) => {
  const { stdout } = await exec('git', ['-C', cwd, ...args], {
    timeout, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  });
  return stdout;
};

export const canonicalPath = async (directory: string) => fs.realpath(directory).catch((error: NodeJS.ErrnoException) => {
  if (error.code !== 'ENOENT') throw error;
  return path.resolve(directory);
});

export const parseWorktreeList = (output: string): IManagedWorktree[] => output.split('\0\0').filter(Boolean).map((record, index) => {
  const fields = new Map(record.split('\0').filter(Boolean).map((field) => {
    const space = field.indexOf(' ');
    return space < 0 ? [field, ''] : [field.slice(0, space), field.slice(space + 1)];
  }));
  return {
    directory: fields.get('worktree')!, head: fields.get('HEAD') ?? '',
    branch: fields.get('branch')?.replace(/^refs\/heads\//, '') ?? null,
    main: index === 0, locked: fields.has('locked'), prunable: fields.has('prunable'),
    missing: false, status: null, workspaces: [], sessions: null, blockers: [], lastOpenedAt: null,
  };
});

export const readWorktreeOperation = async (directory: string): Promise<IWorktreeStatus['operation']> => {
  const gitDir = (await worktreeGit(directory, ['rev-parse', '--absolute-git-dir'])).trim();
  const exists = (name: string) => fs.stat(path.join(gitDir, name)).then(() => true).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  if (await exists('rebase-merge') || await exists('rebase-apply')) return 'rebase';
  return await exists('MERGE_HEAD') ? 'merge' : null;
};

export const readWorktreeStatus = async (directory: string): Promise<IWorktreeStatus> => {
  const output = await worktreeGit(directory, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all', '--ignored=matching']);
  const status: IWorktreeStatus = { modified: 0, staged: 0, untracked: 0, ignored: 0, ignoredPaths: [], conflicts: 0, upstream: null, ahead: null, behind: null, operation: await readWorktreeOperation(directory) };
  const records = output.split('\0');
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.startsWith('# branch.upstream ')) status.upstream = record.slice(18);
    else if (record.startsWith('# branch.ab ')) {
      const counts = /^# branch\.ab \+(\d+) -(\d+)$/.exec(record);
      if (counts) { status.ahead = Number(counts[1]); status.behind = Number(counts[2]); }
    } else if (record.startsWith('? ')) status.untracked++;
    else if (record.startsWith('! ')) { status.ignored++; status.ignoredPaths.push(record.slice(2)); }
    else if (/^[12u] /.test(record)) {
      const xy = record.slice(2, 4);
      if (record[0] === 'u') status.conflicts++;
      if (xy[0] !== '.') status.staged++;
      if (xy[1] !== '.') status.modified++;
      if (record[0] === '2') i++;
    }
  }
  return status;
};

export const inspectManagedWorktree = async (item: IManagedWorktree, repositoryId: string) => {
  try {
    const stat = await fs.stat(item.directory);
    if (!stat.isDirectory()) throw new Error('Worktree path is not a directory');
    const actualRoot = await worktreeGit(item.directory, ['rev-parse', '--show-toplevel']);
    if (await canonicalPath(actualRoot.trim()) !== await canonicalPath(item.directory)) throw new Error('Worktree registration does not match directory');
    const common = (await worktreeGit(item.directory, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim();
    if (await canonicalPath(common) !== repositoryId) throw new Error('Worktree belongs to a different repository');
    item.status = await readWorktreeStatus(item.directory);
  } catch (error) {
    item.missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
    item.error = error instanceof Error ? error.message : String(error);
  }
  return item;
};
