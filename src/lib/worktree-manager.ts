import path from 'node:path';
import { getAllPanesInfo } from '@/lib/tmux';
import { createWorkspace, deleteWorkspace, getWorkspaces } from '@/lib/workspace-store';
import { canonicalPath, inspectManagedWorktree, parseWorktreeList, worktreeGit } from '@/lib/worktree-git';
import type { IWorkspace } from '@/types/terminal';
import type { IWorktreeOverview, IWorktreeRepository, IRemoveWorktreeOptions } from '@/types/worktree';

const inside = (parent: string, child: string) => {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export class WorktreeError extends Error {
  constructor(public code: string, public status = 409) { super(code); }
}

const mutations = globalThis as typeof globalThis & { __worktreeMutationLock?: Promise<unknown> };
export const withWorktreeMutation = <T>(action: () => Promise<T>): Promise<T> => {
  const next = (mutations.__worktreeMutationLock ?? Promise.resolve()).then(action, action);
  mutations.__worktreeMutationLock = next.catch(() => undefined);
  return next;
};

export const getWorktreeOverview = async (source: IWorkspace, only?: { repositoryId: string; directory: string }): Promise<IWorktreeOverview> => {
  const result: IWorktreeOverview = { repositories: [], errors: [] };
  const { workspaces } = await getWorkspaces();
  const normalized = await Promise.all(workspaces.map(async (workspace) => ({
    workspace, directories: await Promise.all(workspace.directories.map(canonicalPath)),
  })));
  const panes = await getAllPanesInfo({ strict: true }).catch(() => null);
  const panePaths = panes ? await Promise.all([...panes].map(async ([name, pane]) => ({ name, directory: await canonicalPath(pane.path) }))) : null;
  const sources = [...source.directories];
  if (source.worktree) sources.push(source.worktree.repository);
  for (const directory of sources) {
    try {
      const id = await canonicalPath((await worktreeGit(directory, ['rev-parse', '--path-format=absolute', '--git-common-dir'])).trim());
      if (only && id !== only.repositoryId) continue;
      if (result.repositories.some((repository) => repository.id === id)) continue;
      const items = parseWorktreeList(await worktreeGit(directory, ['worktree', 'list', '--porcelain', '-z']));
      const repository: IWorktreeRepository = { id, directory, worktrees: [] };
      // Limit concurrent Git processes even when a repository contains many worktrees.
      for (const entry of items) {
        if (only && entry.directory !== only.directory) continue;
        const item = await inspectManagedWorktree(entry, id);
        const root = await canonicalPath(item.directory);
        const associated = normalized.filter(({ directories }) => directories.some((dir) => inside(root, dir)));
        item.workspaces = associated.map(({ workspace }) => ({ id: workspace.id, name: workspace.name }));
        item.lastOpenedAt = associated.map(({ workspace }) => workspace.lastOpenedAt)
          .filter((value): value is string => !!value && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1) ?? null;
        item.sessions = panePaths ? [...new Set(panePaths.filter((pane) => inside(root, pane.directory)
          || associated.some(({ workspace }) => pane.name.startsWith(`pt-${workspace.id}-`))).map((pane) => pane.name.split(':')[0]))] : null;
        if (item.main) item.blockers.push('main');
        if (item.locked) item.blockers.push('locked');
        if (item.missing) item.blockers.push('missing');
        if (!item.status || item.sessions === null) item.blockers.push('unknown');
        if (!item.branch) item.blockers.push('detached');
        if (item.status && (item.status.modified || item.status.staged || item.status.untracked || item.status.conflicts)) item.blockers.push('dirty');
        if (item.status?.operation) item.blockers.push('operation');
        if (item.sessions?.length) item.blockers.push('sessions');
        if (associated.some(({ directories }) => directories.some((dir) => !inside(root, dir)))
          || items.some((other) => other.directory !== item.directory && inside(item.directory, other.directory))) item.blockers.push('sharedWorkspace');
        repository.worktrees.push(item);
      }
      result.repositories.push(repository);
    } catch (error) {
      result.errors.push({ directory, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return result;
};

export const resolveWorktreeItem = async (source: IWorkspace, repositoryId: string, directory: string) => {
  const overview = await getWorktreeOverview(source, { repositoryId, directory });
  const repository = overview.repositories.find((item) => item.id === repositoryId);
  const item = repository?.worktrees.find((item) => item.directory === directory);
  if (!repository || !item) throw new WorktreeError('notFound', 404);
  return { repository, item };
};

export const adoptWorktree = async (source: IWorkspace, repositoryId: string, directory: string) => {
  const { repository, item } = await resolveWorktreeItem(source, repositoryId, directory);
  if (item.workspaces.length) {
    const { workspaces } = await getWorkspaces();
    const existing = workspaces.find((workspace) => workspace.id === item.workspaces[0].id);
    if (existing) return existing;
  }
  if (!item.status || item.missing) throw new WorktreeError('unknown');
  try {
    return await createWorkspace(item.directory, item.branch ?? path.basename(item.directory), undefined, {
      parentWorkspaceId: source.id,
      worktree: { repository: repository.directory, branch: item.branch ?? 'HEAD', baseCommit: item.head },
    });
  } catch (error) {
    const saved = await getWorkspaces().then(({ workspaces }) => workspaces.find((workspace) => workspace.directories.includes(item.directory)));
    if (saved) return saved;
    throw error;
  }
};

export const removeManagedWorktree = async (source: IWorkspace, options: IRemoveWorktreeOptions) => {
  const { repository, item } = await resolveWorktreeItem(source, options.repositoryId, options.directory);
  if (item.blockers.length) throw new WorktreeError(item.blockers[0]);
  if (item.head !== options.head || item.branch !== options.branch) throw new WorktreeError('changed');
  const confirmed = new Set(options.confirmedIgnoredPaths ?? []);
  if (item.status!.ignoredPaths.some((name) => !confirmed.has(name))) throw new WorktreeError('ignored');
  // Run from the common Git directory so deleting the source worktree is supported.
  const git = (args: string[]) => worktreeGit(repository.id, args);
  if (options.deleteBranch) {
    if (!options.targetRef || options.targetRef.startsWith('-')) throw new WorktreeError('targetRequired', 400);
    const target = (await git(['rev-parse', '--symbolic-full-name', '--verify', '--end-of-options', options.targetRef])).trim();
    if (!/^refs\/(heads|remotes)\//.test(target) || target === `refs/heads/${item.branch}`) throw new WorktreeError('targetRequired', 400);
    const targetCommit = (await git(['rev-parse', '--verify', '--end-of-options', `${target}^{commit}`])).trim();
    try { await git(['merge-base', '--is-ancestor', item.head, targetCommit]); }
    catch { throw new WorktreeError('notMerged'); }
  }
  // Git performs its own final dirty/locked check. Never use --force.
  await git(['worktree', 'remove', '--', item.directory]);
  const removedWorkspaceIds: string[] = [];
  const warnings: string[] = [];
  for (const workspace of item.workspaces) {
    try { await deleteWorkspace(workspace.id); removedWorkspaceIds.push(workspace.id); }
    catch { warnings.push('workspaceCleanupFailed'); }
  }
  if (options.deleteBranch) {
    try {
      const head = (await git(['rev-parse', '--verify', '--end-of-options', `refs/heads/${item.branch}`])).trim();
      if (head !== item.head) throw new WorktreeError('changed');
      await git(['branch', '-d', '--', item.branch!]);
    } catch { warnings.push('branchRetained'); }
  }
  return { removedWorkspaceIds, warnings: [...new Set(warnings)] };
};
