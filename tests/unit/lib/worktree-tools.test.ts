import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { IWorkspace } from '@/types/terminal';
const mocks = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn(), panes: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaces: mocks.list, createWorkspace: vi.fn(), deleteWorkspace: mocks.remove }));
vi.mock('@/lib/tmux', () => ({ getAllPanesInfo: mocks.panes }));
import { getWorktreeOverview } from '@/lib/worktree-manager';
import { measureDirectory, previewWorktreeCleanup, cleanupWorktrees } from '@/lib/worktree-organization';
import { filterWorktrees } from '@/lib/worktree-filter';
import { inspectWorktreeSync, synchronizeWorktree, fetchWorktreeRemotes } from '@/lib/worktree-sync';
import { readWorktreeStatus } from '@/lib/worktree-git';
import { readWorktreeMetadata, updateWorktreeMetadata } from '@/lib/worktree-metadata';

const exec = promisify(execFile);
let root: string;
let source: IWorkspace;
let child: IWorkspace;
let repo: string;
let directory: string;
const git = async (cwd: string, ...args: string[]) => (await exec('git', ['-C', cwd, ...args])).stdout.trim();
const commit = async (cwd: string, name: string, content: string) => {
  await fs.writeFile(path.join(cwd, name), content);
  await git(cwd, 'add', '--', name);
  await git(cwd, 'commit', '-m', name);
};
const snapshot = async () => {
  const overview = await getWorktreeOverview(source);
  const repository = overview.repositories[0];
  const item = repository.worktrees.find((item) => item.directory === directory)!;
  return { repositoryId: repository.id, directory, head: item.head, branch: item.branch };
};
const previewSync = async () => {
  const item = await snapshot();
  const info = await inspectWorktreeSync(source, item, 'refs/heads/main');
  return { item, info };
};
beforeEach(async () => {
  vi.resetAllMocks();
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-tools-'));
  vi.spyOn(os, 'homedir').mockReturnValue(root);
  repo = path.join(root, 'repo'); directory = path.join(root, 'task');
  await fs.mkdir(repo);
  await git(repo, 'init', '-b', 'main');
  await git(repo, 'config', 'user.name', 'Test');
  await git(repo, 'config', 'user.email', 'test@example.invalid');
  await commit(repo, 'file.txt', 'base\n');
  await commit(repo, '.gitignore', 'node_modules/\n.env\n');
  await git(repo, 'worktree', 'add', '-b', 'task/one', directory);
  source = { id: 'ws-source', name: 'Source', directories: [repo] };
  child = { id: 'ws-child', name: 'Child', directories: [directory] };
  mocks.list.mockResolvedValue({ workspaces: [source, child] });
  mocks.panes.mockResolvedValue(new Map()); mocks.remove.mockResolvedValue(true);
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

describe('organization helpers', () => {
  it('keeps unknown opening times out of idle candidates and searches branches and workspace names', async () => {
    const initial = await getWorktreeOverview(source);
    const items = initial.repositories[0].worktrees;
    expect(items[1].lastOpenedAt).toBeNull();
    child.lastOpenedAt = '2025-01-01T00:00:00.000Z';
    const updated = (await getWorktreeOverview(source)).repositories[0].worktrees;
    const filter = { query: 'child', idleDays: 30, state: 'all' as const, sort: 'oldest' as const };
    expect(filterWorktrees(items, filter, {}, Date.parse('2025-03-01'))).toEqual([]);
    expect(filterWorktrees(updated, filter, {}, Date.parse('2025-03-01')).map((item) => item.directory)).toEqual([directory]);
    expect(filterWorktrees(updated, { ...filter, query: '', idleDays: 0, state: 'unknown' }, {})).toHaveLength(1);
  });
  it('measures allocated bytes without following symlinks or counting shared Git data, and marks bounded scans partial', async () => {
    const outside = path.join(root, 'outside'); await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'large'), Buffer.alloc(1024 * 1024));
    await fs.symlink(outside, path.join(directory, 'external'));
    const measured = await measureDirectory(directory);
    expect(measured.complete).toBe(true);
    expect(measured.bytes).toBeLessThan(1024 * 1024);
    expect(measured.entries).toBe(3);
    expect((await measureDirectory(directory, { entries: 1, milliseconds: 8000 })).complete).toBe(false);
  });
  it('previews without deleting, then rejects files created after preview and reports partial batch results', async () => {
    const first = await snapshot();
    const secondDir = path.join(root, 'second');
    await git(repo, 'worktree', 'add', '-b', 'task/two', secondDir);
    const second = { ...first, directory: secondDir, branch: 'task/two' };
    const preview = await previewWorktreeCleanup(source, [first, second]);
    expect(preview.every((item) => item.blockers.length === 0)).toBe(true);
    expect(mocks.remove).not.toHaveBeenCalled();
    await fs.writeFile(path.join(directory, 'new.txt'), 'preserve');
    const result = await cleanupWorktrees(source, [first, second]);
    expect(result.results).toMatchObject([{ ok: false, code: 'dirty' }, { ok: true }]);
    expect(await fs.readFile(path.join(directory, 'new.txt'), 'utf8')).toBe('preserve');
    await expect(fs.stat(secondDir)).rejects.toThrow();
    expect(await git(repo, 'rev-parse', 'task/two')).toBe(second.head);
  });
  it('protects the workspace hosting the batch panel and detects changed snapshots', async () => {
    const item = await snapshot();
    expect((await previewWorktreeCleanup(child, [item]))[0].blockers).toContain('batchSource');
    expect((await cleanupWorktrees(child, [item])).results[0]).toMatchObject({ ok: false, code: 'batchSource' });
    await commit(directory, 'new.txt', 'new');
    expect((await previewWorktreeCleanup(source, [item]))[0].blockers).toContain('changed');
  });
  it('serializes metadata updates without dropping other worktree preferences', async () => {
    await Promise.all([updateWorktreeMetadata('one', { targetRef: 'refs/heads/main' }), updateWorktreeMetadata('two', { targetRef: 'refs/heads/release' })]);
    expect(await readWorktreeMetadata('one')).toEqual({ targetRef: 'refs/heads/main' });
    expect(await readWorktreeMetadata('two')).toEqual({ targetRef: 'refs/heads/release' });
  });
});

describe('sync and delivery Git operations', () => {
  it('previews divergence and merges the target into only the selected worktree', async () => {
    await commit(repo, 'main.txt', 'main'); await commit(directory, 'task.txt', 'task');
    const { item, info } = await previewSync();
    expect(info).toMatchObject({ ahead: 1, behind: 1, operation: null, targetRef: 'refs/heads/main' });
    const result = await synchronizeWorktree(source, item, 'merge', info.targetRef!, info.targetHead!);
    expect(result.ok).toBe(true);
    expect(await git(repo, 'rev-parse', 'main')).toBe(info.targetHead);
    expect(await fs.readFile(path.join(directory, 'main.txt'), 'utf8')).toBe('main');
    expect((await inspectWorktreeSync(source, await snapshot())).targetRef).toBe('refs/heads/main');
  });
  it('rejects a moved target, sessions, and uncommitted changes before merge', async () => {
    const { item, info } = await previewSync();
    await commit(repo, 'main.txt', 'new');
    await expect(synchronizeWorktree(source, item, 'merge', info.targetRef!, info.targetHead!)).rejects.toMatchObject({ code: 'targetChanged' });
    const latest = await previewSync();
    mocks.panes.mockResolvedValue(new Map([['pt-ws-child-pane-tab', { path: directory }]]));
    await expect(synchronizeWorktree(source, latest.item, 'merge', latest.info.targetRef!, latest.info.targetHead!)).rejects.toMatchObject({ code: 'sessions' });
    mocks.panes.mockResolvedValue(new Map()); await fs.writeFile(path.join(directory, 'untracked'), 'keep');
    await expect(synchronizeWorktree(source, latest.item, 'merge', latest.info.targetRef!, latest.info.targetHead!)).rejects.toMatchObject({ code: 'dirty' });
  });
  it('allows unrelated ignored dependencies but protects ignored files present in the target', async () => {
    await fs.mkdir(path.join(directory, 'node_modules')); await fs.writeFile(path.join(directory, 'node_modules', 'lib'), 'keep');
    await commit(repo, 'main.txt', 'new');
    const { item, info } = await previewSync();
    expect((await synchronizeWorktree(source, item, 'merge', info.targetRef!, info.targetHead!)).ok).toBe(true);
    await fs.writeFile(path.join(repo, '.env'), 'tracked'); await git(repo, 'add', '-f', '.env'); await git(repo, 'commit', '-m', 'env');
    await fs.writeFile(path.join(directory, '.env'), 'private');
    const next = await previewSync();
    await expect(synchronizeWorktree(source, next.item, 'merge', next.info.targetRef!, next.info.targetHead!)).rejects.toMatchObject({ code: 'ignoredCollision' });
    expect(await fs.readFile(path.join(directory, '.env'), 'utf8')).toBe('private');
  });
  it('keeps merge conflicts visible, blocks cleanup, and supports continuing after resolution', async () => {
    await commit(repo, 'file.txt', 'main\n'); await commit(directory, 'file.txt', 'task\n');
    const { item, info } = await previewSync();
    expect(await synchronizeWorktree(source, item, 'merge', info.targetRef!, info.targetHead!)).toMatchObject({ ok: false, operation: 'merge' });
    expect((await previewWorktreeCleanup(source, [await snapshot()]))[0].blockers).toContain('operation');
    await fs.writeFile(path.join(directory, 'file.txt'), 'resolved\n'); await git(directory, 'add', 'file.txt');
    expect(await synchronizeWorktree(source, await snapshot(), 'continue')).toMatchObject({ ok: true, operation: null });
    expect((await readWorktreeStatus(directory)).conflicts).toBe(0);
  });
  it('rebases without changing target or other branches and permits unrelated ignored files', async () => {
    await commit(repo, 'main.txt', 'main'); await commit(directory, 'task.txt', 'task');
    await git(repo, 'branch', 'backup', 'task/one');
    await git(repo, 'config', 'rebase.updateRefs', 'true');
    await fs.mkdir(path.join(directory, 'node_modules')); await fs.writeFile(path.join(directory, 'node_modules', 'lib'), 'keep');
    const { item, info } = await previewSync();
    expect(await synchronizeWorktree(source, item, 'rebase', info.targetRef!, info.targetHead!)).toMatchObject({ ok: true, operation: null });
    expect(await git(repo, 'rev-parse', 'backup')).toBe(item.head);
    expect(await git(repo, 'rev-parse', 'main')).toBe(info.targetHead);
    expect(await git(directory, 'rev-parse', 'HEAD')).not.toBe(item.head);
  });
  it('can abort a rebase while HEAD is detached, restoring the original branch and content', async () => {
    await commit(repo, 'file.txt', 'main\n'); await commit(directory, 'file.txt', 'task\n');
    const { item, info } = await previewSync();
    expect(await synchronizeWorktree(source, item, 'rebase', info.targetRef!, info.targetHead!)).toMatchObject({ ok: false, operation: 'rebase' });
    const current = await snapshot(); expect(current.branch).toBeNull();
    expect(await synchronizeWorktree(source, current, 'abort')).toMatchObject({ ok: true, operation: null });
    expect(await git(directory, 'rev-parse', 'HEAD')).toBe(item.head);
    expect(await git(directory, 'branch', '--show-current')).toBe('task/one');
    expect(await fs.readFile(path.join(directory, 'file.txt'), 'utf8')).toBe('task\n');
  });
  it('protects ignored files touched by historical commits that rebase would replay', async () => {
    await fs.writeFile(path.join(directory, '.env'), 'old'); await git(directory, 'add', '-f', '.env'); await git(directory, 'commit', '-m', 'add env');
    await git(directory, 'rm', '.env'); await git(directory, 'commit', '-m', 'remove env');
    await fs.writeFile(path.join(directory, '.env'), 'private'); await commit(repo, 'main.txt', 'new');
    const { item, info } = await previewSync();
    await expect(synchronizeWorktree(source, item, 'rebase', info.targetRef!, info.targetHead!)).rejects.toMatchObject({ code: 'ignoredCollision' });
    expect(await fs.readFile(path.join(directory, '.env'), 'utf8')).toBe('private');
  });
  it('fetches local test remotes without merging or pushing the worktree branch', async () => {
    const remote = path.join(root, 'remote.git'); await git(repo, 'init', '--bare', remote);
    await git(repo, 'remote', 'add', 'origin', remote); await git(repo, 'push', 'origin', 'main');
    const item = await snapshot();
    expect(await fetchWorktreeRemotes(source, item)).toEqual({ ok: true });
    expect(await git(directory, 'rev-parse', 'HEAD')).toBe(item.head);
    await expect(git(remote, 'rev-parse', '--verify', 'task/one')).rejects.toThrow();
  });
});
