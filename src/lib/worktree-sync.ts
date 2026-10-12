import { getWorktreeReviewRemotes } from '@/lib/worktree-delivery';
import { readWorktreeOperation, worktreeGit } from '@/lib/worktree-git';
import { resolveWorktreeItem, WorktreeError } from '@/lib/worktree-manager';
import { readWorktreeMetadata, updateWorktreeMetadata, worktreeMetadataKey } from '@/lib/worktree-metadata';
import { getAllPanesInfo } from '@/lib/tmux';
import type { IWorkspace } from '@/types/terminal';
import type { IManagedWorktree, IWorktreeSyncInfo, IWorktreeSyncResult, TWorktreeSnapshot } from '@/types/worktree';

const syncBlockers = async (item: IManagedWorktree, refresh = true) => {
  let idle = false;
  if (item.sessions?.length) {
    try {
      const panes = await getAllPanesInfo({ strict: true });
      const extraPane = [...panes.keys()].some((name) => name.includes(':') && item.sessions!.includes(name.split(':')[0]));
      if (!extraPane) {
        const { getStatusManager } = await import('@/lib/status-manager');
        const manager = getStatusManager();
        if (refresh) await manager.poll(panes);
        idle = manager.areSessionsIdle(item.sessions, panes);
      }
    } catch {
      idle = false;
    }
  }
  return item.blockers.filter((reason) => reason !== 'ignored' && !(reason === 'sessions' && idle));
};

const executionBlockers = async (item: IManagedWorktree, resuming: boolean, refresh = true) =>
  (await syncBlockers(item, refresh)).filter((reason) => !(resuming && (reason === 'operation' || reason === 'dirty'
    || (reason === 'detached' && item.status?.operation === 'rebase'))));

const resolveTarget = async (directory: string, target: string) => {
  if (target.startsWith('-')) throw new WorktreeError('targetRequired', 400);
  const ref = (await worktreeGit(directory, ['rev-parse', '--symbolic-full-name', '--verify', '--end-of-options', target])).trim();
  if (!/^refs\/(heads|remotes)\//.test(ref)) throw new WorktreeError('targetRequired', 400);
  const head = (await worktreeGit(directory, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).trim();
  return { ref, head };
};

export const inspectWorktreeSync = async (source: IWorkspace, snapshot: TWorktreeSnapshot, targetRef?: string): Promise<IWorktreeSyncInfo> => {
  const { item } = await resolveWorktreeItem(source, snapshot.repositoryId, snapshot.directory);
  if (!item.status) throw new WorktreeError('unknown');
  const metadata = await readWorktreeMetadata(worktreeMetadataKey(snapshot.repositoryId, item.directory, item.branch));
  const refs = await worktreeGit(item.directory, ['for-each-ref', '--sort=refname', '--format=%(refname)%09%(symref)', 'refs/heads/', 'refs/remotes/']);
  const branches = refs.trim().split('\n').filter(Boolean).flatMap((line) => {
    const [ref, symbolic] = line.split('\t');
    return symbolic ? [] : [{ ref, name: ref.replace(/^refs\/(heads|remotes)\//, '') }];
  });
  const selected = targetRef ?? [metadata.targetRef, metadata.baseRef, item.branch ? `refs/heads/${item.branch}` : undefined]
    .find((ref) => branches.some((branch) => branch.ref === ref));
  const target = selected ? await resolveTarget(item.directory, selected) : null;
  let ahead: number | null = null;
  let behind: number | null = null;
  if (target) {
    const counts = (await worktreeGit(item.directory, ['rev-list', '--left-right', '--count', `${item.head}...${target.head}`])).trim().split(/\s+/);
    [ahead, behind] = counts.map(Number);
  }
  return { head: item.head, branch: item.branch, branches, remotes: await getWorktreeReviewRemotes(item.directory), targetRef: target?.ref ?? null, targetHead: target?.head ?? null,
    ahead, behind, operation: item.status.operation,
    blockers: await syncBlockers(item), review: metadata.review ?? null };
};

const protectIgnoredFiles = async (directory: string, target: string, rebase: boolean) => {
  const ignored = (await worktreeGit(directory, ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory', '-z'])).split('\0').filter(Boolean);
  if (!ignored.length) return;
  const targetPaths = (await worktreeGit(directory, ['ls-tree', '-r', '--name-only', '-z', target])).split('\0').filter(Boolean);
  if (rebase) {
    const replayPaths = await worktreeGit(directory, ['log', '--format=', '--name-only', '-z', `${target}..HEAD`]);
    targetPaths.push(...replayPaths.split('\0').filter(Boolean));
  }
  if (ignored.some((name) => targetPaths.some((targetPath) => targetPath === name || (name.endsWith('/') && targetPath.startsWith(name))
    || name.startsWith(`${targetPath}/`)))) throw new WorktreeError('ignoredCollision');
};

export const synchronizeWorktree = async (source: IWorkspace, snapshot: TWorktreeSnapshot, action: 'merge' | 'rebase' | 'continue' | 'abort', targetRef?: string, targetHead?: string): Promise<IWorktreeSyncResult> => {
  const { item } = await resolveWorktreeItem(source, snapshot.repositoryId, snapshot.directory);
  if (item.head !== snapshot.head || item.branch !== snapshot.branch) throw new WorktreeError('changed');
  const resuming = action === 'continue' || action === 'abort';
  const blockers = await executionBlockers(item, resuming);
  if (blockers.length) throw new WorktreeError(blockers[0]);
  let args: string[];
  if (resuming) {
    if (!item.status?.operation) throw new WorktreeError('noOperation');
    args = [item.status.operation, `--${action}`];
  } else {
    if (!targetRef || !targetHead) throw new WorktreeError('targetRequired', 400);
    const target = await resolveTarget(item.directory, targetRef);
    if (target.ref === `refs/heads/${item.branch}`) throw new WorktreeError('targetRequired', 400);
    if (target.head !== targetHead) throw new WorktreeError('targetChanged');
    await protectIgnoredFiles(item.directory, target.head, action === 'rebase');
    await updateWorktreeMetadata(worktreeMetadataKey(snapshot.repositoryId, item.directory, item.branch), { targetRef: target.ref });
    args = action === 'merge' ? ['merge', '--no-edit', '--no-autostash', '--no-overwrite-ignore', target.head]
      : ['rebase', '--no-autostash', '--no-update-refs', target.head];
  }
  const refreshedBlockers = await executionBlockers(item, resuming);
  if (refreshedBlockers.length) throw new WorktreeError(refreshedBlockers[0]);
  const { item: current } = await resolveWorktreeItem(source, snapshot.repositoryId, snapshot.directory);
  if (current.head !== snapshot.head || current.branch !== snapshot.branch) throw new WorktreeError('changed');
  const currentBlockers = await executionBlockers(current, resuming, false);
  if (currentBlockers.length) throw new WorktreeError(currentBlockers[0]);
  try {
    const output = await worktreeGit(item.directory, ['-c', 'core.editor=true', '-c', 'sequence.editor=true', ...args], 60_000);
    return { ok: true, operation: await readWorktreeOperation(item.directory), output };
  } catch (error) {
    const detail = error as { stderr?: string; stdout?: string; message?: string };
    return { ok: false, operation: await readWorktreeOperation(item.directory), output: [detail.stdout, detail.stderr, detail.message].filter(Boolean).join('\n') };
  }
};

export const fetchWorktreeRemotes = async (source: IWorkspace, snapshot: TWorktreeSnapshot) => {
  const { item } = await resolveWorktreeItem(source, snapshot.repositoryId, snapshot.directory);
  if (!item.status) throw new WorktreeError('unknown');
  await worktreeGit(item.directory, ['fetch', '--all', '--no-prune'], 60_000);
  return { ok: true };
};
