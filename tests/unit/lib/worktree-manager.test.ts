import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IWorkspace } from '@/types/terminal';
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), remove: vi.fn(), panes: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaces: mocks.list, createWorkspace: mocks.create, deleteWorkspace: mocks.remove }));
vi.mock('@/lib/tmux', () => ({ getAllPanesInfo: mocks.panes }));
import { adoptWorktree, getWorktreeOverview, removeManagedWorktree, withWorktreeMutation } from '@/lib/worktree-manager';
import { parseWorktreeList, readWorktreeStatus } from '@/lib/worktree-git';

const exec = promisify(execFile);
let root: string;
let source: IWorkspace;
let child: IWorkspace;
let workspaces: IWorkspace[];
const git = async (cwd: string, ...args: string[]) => (await exec('git', ['-C', cwd, ...args])).stdout.trim();
const commit = async (cwd: string) => {
  await git(cwd, 'add', '.');
  await git(cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
};
const selection = async () => {
  const overview = await getWorktreeOverview(source);
  const repository = overview.repositories[0];
  const item = repository.worktrees.find((item) => item.directory === child.directories[0])!;
  return { repository, item, options: { repositoryId: repository.id, directory: item.directory, head: item.head, branch: item.branch, deleteBranch: false } };
};

beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-manage-'));
  const repository = path.join(root, 'repo');
  await fs.mkdir(repository);
  await git(repository, 'init', '-b', 'main');
  await fs.writeFile(path.join(repository, 'file.txt'), 'committed\n');
  await fs.writeFile(path.join(repository, '.gitignore'), 'ignored/\n');
  await commit(repository);
  const directory = path.join(root, 'external worktree 中文');
  await git(repository, 'worktree', 'add', '-b', 'task/one', directory);
  source = { id: 'ws-source', name: 'Source', directories: [repository] };
  child = { id: 'ws-child', name: 'Child', directories: [directory], parentWorkspaceId: source.id };
  workspaces = [source];
  mocks.list.mockImplementation(async () => ({ workspaces }));
  mocks.panes.mockResolvedValue(new Map());
  mocks.create.mockImplementation(async () => { workspaces.push(child); return child; });
  mocks.remove.mockResolvedValue(true);
});
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }); });

describe('worktree overview and adoption', () => {
  it('discovers external worktrees, deduplicates repositories, and reuses adoption', async () => {
    source.directories.push(child.directories[0]);
    const { repositories } = await getWorktreeOverview(source);
    expect(repositories).toHaveLength(1);
    expect(repositories[0].worktrees).toHaveLength(2);
    source.directories.pop();
    const { repository, item } = await selection();
    expect(item.branch).toBe('task/one');
    expect(item.workspaces).toEqual([]);
    expect(item.blockers).toEqual([]);
    await Promise.all([0, 1].map(() => withWorktreeMutation(() => adoptWorktree(source, repository.id, item.directory))));
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect((await selection()).item.workspaces).toEqual([{ id: child.id, name: child.name }]);
  });

  it('reads the actual branch and handles renamed files without counting the old path', async () => {
    const cwd = child.directories[0];
    await git(cwd, 'switch', '-c', 'task/changed');
    await git(cwd, 'mv', 'file.txt', 'renamed\nfile.txt');
    await fs.writeFile(path.join(cwd, '? filename.txt'), 'new');
    const { item } = await selection();
    expect(item.branch).toBe('task/changed');
    expect(item.status).toMatchObject({ staged: 1, modified: 0, untracked: 1, conflicts: 0, ahead: null, upstream: null });
  });

  it('reports real upstream counts and conflicts', async () => {
    const cwd = child.directories[0];
    await git(cwd, 'branch', '--set-upstream-to=main');
    await fs.writeFile(path.join(cwd, 'file.txt'), 'child\n');
    await commit(cwd);
    expect(await readWorktreeStatus(cwd)).toMatchObject({ upstream: 'main', ahead: 1, behind: 0 });
    await fs.writeFile(path.join(source.directories[0], 'file.txt'), 'parent\n');
    await commit(source.directories[0]);
    await git(cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'merge', 'main').catch(() => undefined);
    expect(await readWorktreeStatus(cwd)).toMatchObject({ conflicts: 1, ahead: 1, behind: 1 });
  });

  it('preserves NUL-delimited paths and lock reasons', () => {
    const items = parseWorktreeList('worktree /repo\0HEAD abc\0branch refs/heads/main\0\0worktree /a\n目录\0HEAD def\0detached\0locked reason\0\0');
    expect(items[1]).toMatchObject({ directory: '/a\n目录', branch: null, locked: true, main: false });
  });

  it('recovers workspace registration after prompt writing fails', async () => {
    mocks.create.mockImplementation(async () => { workspaces.push(child); throw new Error('prompt failure'); });
    const { repository, item } = await selection();
    expect(await adoptWorktree(source, repository.id, item.directory)).toEqual(child);
  });
});

describe('safe removal', () => {
  it('removes a clean worktree and its workspace, preserving the branch', async () => {
    workspaces.push(child);
    const { options } = await selection();
    const result = await removeManagedWorktree(source, options);
    expect(result).toEqual({ removedWorkspaceIds: [child.id], warnings: [] });
    await expect(fs.stat(child.directories[0])).rejects.toThrow();
    expect(await git(source.directories[0], 'rev-parse', 'refs/heads/task/one')).toBe(options.head);
    expect(mocks.remove).toHaveBeenCalledWith(child.id);
  });

  it('rechecks dirty files at deletion time', async () => {
    const { options } = await selection();
    await fs.writeFile(path.join(child.directories[0], 'new.txt'), 'precious');
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'dirty' });
    expect(await fs.readFile(path.join(child.directories[0], 'new.txt'), 'utf8')).toBe('precious');
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('lists ignored paths and removes them only after confirmation', async () => {
    await fs.mkdir(path.join(child.directories[0], 'ignored'));
    await fs.writeFile(path.join(child.directories[0], 'ignored', 'secret'), 'precious');
    const { item, options } = await selection();
    expect(item.status).toMatchObject({ ignored: 1, ignoredPaths: ['ignored/'], untracked: 0 });
    expect(item.blockers).toEqual([]);
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'ignored' });
    expect(await fs.readFile(path.join(child.directories[0], 'ignored', 'secret'), 'utf8')).toBe('precious');
    await removeManagedWorktree(source, { ...options, confirmedIgnoredPaths: item.status!.ignoredPaths });
    await expect(fs.stat(child.directories[0])).rejects.toThrow();
  });

  it('requires confirmation for newly discovered ignored paths and still protects dirty files', async () => {
    const cwd = child.directories[0];
    const { repository, options } = await selection();
    await fs.appendFile(path.join(repository.id, 'info', 'exclude'), '\n*.local\n');
    await fs.writeFile(path.join(cwd, '配置\nsecret.local'), 'precious');
    expect((await selection()).item.status!.ignoredPaths).toEqual(['配置\nsecret.local']);
    await expect(removeManagedWorktree(source, { ...options, confirmedIgnoredPaths: [] })).rejects.toMatchObject({ code: 'ignored' });
    await fs.writeFile(path.join(cwd, 'file.txt'), 'modified');
    await expect(removeManagedWorktree(source, { ...options, confirmedIgnoredPaths: ['配置\nsecret.local'] })).rejects.toMatchObject({ code: 'dirty' });
    expect(await fs.readFile(path.join(cwd, 'file.txt'), 'utf8')).toBe('modified');
  });

  it('protects sessions belonging to the workspace even after they cd elsewhere', async () => {
    workspaces.push(child);
    mocks.panes.mockResolvedValue(new Map([['pt-ws-child-pane-tab', { path: root }]]));
    const { item, options } = await selection();
    expect(item.sessions).toEqual(['pt-ws-child-pane-tab']);
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'sessions' });
  });

  it('detects sessions from another workspace inside the directory, and fails closed on tmux errors', async () => {
    mocks.panes.mockResolvedValue(new Map([['pt-other', { path: child.directories[0] }]]));
    const { options } = await selection();
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'sessions' });
    mocks.panes.mockRejectedValue(new Error('tmux permission denied'));
    expect((await selection()).item.sessions).toBeNull();
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'unknown' });
  });

  it('protects main, locked, missing, and detached worktrees', async () => {
    const { repository, options } = await selection();
    const main = repository.worktrees[0];
    await expect(removeManagedWorktree(source, { ...options, directory: main.directory, head: main.head })).rejects.toMatchObject({ code: 'main' });
    await git(source.directories[0], 'worktree', 'lock', child.directories[0]);
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'locked' });
    await git(source.directories[0], 'worktree', 'unlock', child.directories[0]);
    await git(child.directories[0], 'checkout', '--detach');
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'detached' });
    await fs.rm(child.directories[0], { recursive: true });
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'missing' });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('rejects paths outside the selected repository and protects mixed workspaces', async () => {
    const { options } = await selection();
    await expect(removeManagedWorktree(source, { ...options, directory: root })).rejects.toMatchObject({ code: 'notFound' });
    workspaces.push({ ...child, directories: [...child.directories, root] });
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'sharedWorkspace' });
  });

  it('rejects changed HEAD and branches unmerged into the explicit target', async () => {
    const { options } = await selection();
    await fs.writeFile(path.join(child.directories[0], 'file.txt'), 'new');
    await commit(child.directories[0]);
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'changed' });
    const updated = (await selection()).options;
    await expect(removeManagedWorktree(source, { ...updated, deleteBranch: true, targetRef: 'main' })).rejects.toMatchObject({ code: 'notMerged' });
    await expect(removeManagedWorktree(source, { ...updated, deleteBranch: true, targetRef: 'task/one' })).rejects.toMatchObject({ code: 'targetRequired' });
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it('requires renewed confirmation when the branch changes without a new commit', async () => {
    const { options } = await selection();
    await git(child.directories[0], 'switch', '-c', 'task/another');
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'changed' });
    expect(await git(child.directories[0], 'branch', '--show-current')).toBe('task/another');
  });

  it('does not adopt or delete a directory replaced by another repository', async () => {
    const { options } = await selection();
    await fs.rename(child.directories[0], path.join(root, 'preserved-worktree'));
    await fs.mkdir(child.directories[0]);
    await git(child.directories[0], 'init');
    expect((await selection()).item.status).toBeNull();
    await expect(removeManagedWorktree(source, options)).rejects.toMatchObject({ code: 'unknown' });
    await expect(adoptWorktree(source, options.repositoryId, options.directory)).rejects.toMatchObject({ code: 'unknown' });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('can delete a merged branch and reports partial workspace cleanup', async () => {
    workspaces.push(child);
    mocks.remove.mockRejectedValue(new Error('disk error'));
    const { options } = await selection();
    const result = await removeManagedWorktree(source, { ...options, deleteBranch: true, targetRef: 'refs/heads/main' });
    expect(result).toEqual({ removedWorkspaceIds: [], warnings: ['workspaceCleanupFailed'] });
    await expect(git(source.directories[0], 'rev-parse', '--verify', 'refs/heads/task/one')).rejects.toThrow();
  });

  it('can remove the source linked worktree using the common Git directory', async () => {
    workspaces.push(child);
    const { options } = await selection();
    expect(await removeManagedWorktree(child, options)).toMatchObject({ removedWorkspaceIds: [child.id], warnings: [] });
  });
});
