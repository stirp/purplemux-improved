import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createGitWorktree, inspectWorktreeSource } from '@/lib/git-worktree';
import { getVisuallyOrderedWorkspaces } from '@/lib/workspace-order';
import type { IWorkspace } from '@/types/terminal';
const exec = promisify(execFile);
let root: string;
let workspace: IWorkspace;
const git = async (...args: string[]) => (await exec('git', ['-C', workspace.directories[0], ...args])).stdout.trim();
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-worktree-test-'));
  vi.spyOn(os, 'homedir').mockReturnValue(root);
  const repository = path.join(root, 'repository');
  await fs.mkdir(repository);
  workspace = { id: 'ws-test', name: 'Test', directories: [repository] };
  await git('init');
  await fs.writeFile(path.join(repository, 'file.txt'), 'committed');
  await git('add', '.');
  await git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });
describe('isolated Git worktrees', () => {
  it('creates an independent branch without copying or altering dirty source changes', async () => {
    const original = await git('branch', '--show-current');
    await fs.writeFile(path.join(workspace.directories[0], 'file.txt'), 'dirty');
    expect((await inspectWorktreeSource(workspace, 0)).dirty).toBe(true);
    const created = await createGitWorktree(workspace, 0, 'task/one', 'HEAD');
    expect(await fs.readFile(path.join(created.directory, 'file.txt'), 'utf8')).toBe('committed');
    expect(await fs.readFile(path.join(workspace.directories[0], 'file.txt'), 'utf8')).toBe('dirty');
    expect(await git('branch', '--show-current')).toBe(original);
    expect((await exec('git', ['-C', created.directory, 'branch', '--show-current'])).stdout.trim()).toBe('task/one');
    const child = { ...workspace, id: 'ws-child', directories: [created.directory] };
    expect((await inspectWorktreeSource(child, 0)).branch).toBe('task/one');
    expect((await createGitWorktree(child, 0, 'task/nested', 'HEAD')).baseCommit).toBe(created.baseCommit);
  });
  it('rejects duplicates, invalid refs and traversal without replacing data', async () => {
    const created = await createGitWorktree(workspace, 0, 'task/one', 'HEAD');
    await expect(createGitWorktree(workspace, 0, 'task/one', 'HEAD')).rejects.toThrow();
    await expect(createGitWorktree(workspace, 0, '../escape', 'HEAD')).rejects.toThrow();
    await expect(createGitWorktree(workspace, 0, 'new', 'missing-ref')).rejects.toThrow();
    await expect(createGitWorktree(workspace, 0, 'task-one', 'HEAD')).rejects.toThrow();
    expect(await fs.readFile(path.join(created.directory, 'file.txt'), 'utf8')).toBe('committed');
    expect(await git('branch', '--list', 'new')).toBe('');
  });
});
describe('subtask ordering', () => {
  const parent: IWorkspace = { id: 'parent', name: 'Parent', directories: [], groupId: 'b' };
  const child: IWorkspace = { id: 'child', name: 'Child', directories: [], parentWorkspaceId: 'parent', groupId: 'a' };
  it('keeps descendants with the parent and inherits its group', () => {
    const nested = { ...child, id: 'nested', parentWorkspaceId: 'child' };
    const ordered = getVisuallyOrderedWorkspaces([nested, child, parent], [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
    expect(ordered.map((ws) => [ws.id, ws.groupId])).toEqual([['parent', 'b'], ['child', 'b'], ['nested', 'b']]);
    expect(child.groupId).toBe('a');
  });
  it('keeps orphaned and cyclic records accessible exactly once', () => {
    const ordered = getVisuallyOrderedWorkspaces([child, { ...parent, parentWorkspaceId: 'child' }, { ...child, id: 'orphan', parentWorkspaceId: 'missing' }], []);
    expect(new Set(ordered.map((ws) => ws.id)).size).toBe(3);
    expect(ordered).toHaveLength(3);
  });
});
