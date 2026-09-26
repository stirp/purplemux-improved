import fs from 'node:fs/promises';
import path from 'node:path';
import { getWorktreeOverview, removeManagedWorktree, resolveWorktreeItem, WorktreeError } from '@/lib/worktree-manager';
import type { IWorkspace } from '@/types/terminal';
import type { ICleanupCandidate, ICleanupResult, IWorktreeSize, TWorktreeSnapshot } from '@/types/worktree';

export const measureDirectory = async (directory: string, limits = { entries: 100_000, milliseconds: 8_000 }): Promise<IWorktreeSize> => {
  const root = await fs.realpath(directory);
  const rootStat = await fs.stat(root);
  const stack = [root];
  const seen = new Set<string>();
  const deadline = Date.now() + limits.milliseconds;
  let bytes = 0;
  let entries = 0;
  let complete = true;
  while (stack.length) {
    const current = stack.pop()!;
    try {
      const children = await fs.opendir(current);
      for await (const child of children) {
        if (child.name === '.git') continue;
        if (entries >= limits.entries || Date.now() >= deadline) return { bytes, entries, complete: false, measuredAt: new Date().toISOString() };
        const name = path.join(current, child.name);
        try {
          const stat = await fs.lstat(name);
          entries++;
          if (stat.dev !== rootStat.dev) { complete = false; continue; }
          const inode = `${stat.dev}:${stat.ino}`;
          if (stat.nlink > 1 && seen.has(inode)) continue;
          if (stat.nlink > 1) seen.add(inode);
          bytes += typeof stat.blocks === 'number' ? stat.blocks * 512 : stat.size;
          if (stat.isDirectory() && !stat.isSymbolicLink()) stack.push(name);
        } catch { complete = false; }
      }
    } catch { complete = false; }
  }
  return { bytes, entries, complete, measuredAt: new Date().toISOString() };
};

export const measureWorktree = async (source: IWorkspace, snapshot: TWorktreeSnapshot) => {
  const { item } = await resolveWorktreeItem(source, snapshot.repositoryId, snapshot.directory);
  if (!item.status || item.missing) throw new WorktreeError('unknown');
  return measureDirectory(item.directory);
};

export const previewWorktreeCleanup = async (source: IWorkspace, snapshots: TWorktreeSnapshot[]): Promise<ICleanupCandidate[]> => {
  const overview = await getWorktreeOverview(source);
  return snapshots.map((snapshot) => {
    const item = overview.repositories.find((repo) => repo.id === snapshot.repositoryId)?.worktrees.find((item) => item.directory === snapshot.directory);
    const blockers = item ? [...item.blockers] : ['notFound'];
    if (item?.workspaces.some((workspace) => workspace.id === source.id)) blockers.push('batchSource');
    if (item && (item.head !== snapshot.head || item.branch !== snapshot.branch)) blockers.push('changed');
    return { ...snapshot, blockers, ignoredPaths: item?.status?.ignoredPaths ?? [], workspaces: item?.workspaces ?? [] };
  });
};

export const cleanupWorktrees = async (source: IWorkspace, snapshots: TWorktreeSnapshot[]): Promise<ICleanupResult> => {
  const overview = await getWorktreeOverview(source);
  // Anchor repository access to the verified Git directories for the whole batch.
  const anchored = { ...source, directories: overview.repositories.map((repo) => repo.id), worktree: undefined };
  const result: ICleanupResult = { removedWorkspaceIds: [], warnings: [], results: [] };
  for (const snapshot of snapshots) {
    try {
      const { item } = await resolveWorktreeItem(anchored, snapshot.repositoryId, snapshot.directory);
      if (item.workspaces.some((workspace) => workspace.id === source.id)) throw new WorktreeError('batchSource');
      const removed = await removeManagedWorktree(anchored, { ...snapshot, deleteBranch: false });
      result.removedWorkspaceIds.push(...removed.removedWorkspaceIds);
      result.warnings.push(...removed.warnings);
      result.results.push({ directory: snapshot.directory, ok: true, warnings: removed.warnings });
    } catch (error) {
      result.results.push({ directory: snapshot.directory, ok: false, error: error instanceof Error ? error.message : String(error),
        ...(error instanceof WorktreeError ? { code: error.code } : {}) });
    }
  }
  result.removedWorkspaceIds = [...new Set(result.removedWorkspaceIds)];
  result.warnings = [...new Set(result.warnings)];
  return result;
};
