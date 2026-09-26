export interface IWorktreeStatus {
  modified: number;
  staged: number;
  untracked: number;
  ignored: number;
  ignoredPaths: string[];
  conflicts: number;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
  operation: 'merge' | 'rebase' | null;
}

export type TWorktreeBlocker = 'main' | 'locked' | 'missing' | 'unknown' | 'dirty' | 'ignored' | 'sessions' | 'detached' | 'sharedWorkspace' | 'operation';

export interface IManagedWorktree {
  directory: string;
  head: string;
  branch: string | null;
  main: boolean;
  locked: boolean;
  missing: boolean;
  prunable: boolean;
  status: IWorktreeStatus | null;
  error?: string;
  workspaces: { id: string; name: string }[];
  sessions: string[] | null;
  blockers: TWorktreeBlocker[];
  lastOpenedAt: string | null;
}

export interface IWorktreeRepository {
  id: string;
  directory: string;
  worktrees: IManagedWorktree[];
}

export interface IWorktreeOverview {
  repositories: IWorktreeRepository[];
  errors: { directory: string; error: string }[];
}

export interface IRemoveWorktreeOptions {
  repositoryId: string;
  directory: string;
  head: string;
  branch: string | null;
  deleteBranch: boolean;
  confirmedIgnoredPaths?: string[];
  targetRef?: string;
}

export interface IRemoveWorktreeResult {
  removedWorkspaceIds: string[];
  warnings: string[];
}

export type TWorktreeSnapshot = Pick<IRemoveWorktreeOptions, 'repositoryId' | 'directory' | 'head' | 'branch' | 'confirmedIgnoredPaths'>;
export interface IWorktreeSize {
  bytes: number;
  entries: number;
  complete: boolean;
  measuredAt: string;
}
export interface ICleanupCandidate extends TWorktreeSnapshot {
  ignoredPaths: string[];
  blockers: string[];
  workspaces: { id: string; name: string }[];
}
export interface ICleanupResult extends IRemoveWorktreeResult {
  results: { directory: string; ok: boolean; error?: string; code?: string; warnings?: string[] }[];
}
export interface IWorktreeSyncInfo {
  head: string;
  branch: string | null;
  branches: { ref: string; name: string }[];
  remotes: { name: string; repository: string }[];
  targetRef: string | null;
  targetHead: string | null;
  ahead: number | null;
  behind: number | null;
  operation: 'merge' | 'rebase' | null;
  blockers: string[];
  review: IWorktreeReview | null;
}
export interface IWorktreeSyncResult {
  ok: boolean;
  operation: 'merge' | 'rebase' | null;
  output: string;
}
export interface IWorktreeReview {
  url: string;
  provider: 'github' | 'gitlab';
  state: 'unknown' | 'open' | 'draft' | 'merged' | 'closed';
  title?: string;
  head?: string;
  sourceBranch?: string;
  targetBranch?: string;
  checkedAt?: string;
  error?: string;
}

export interface IWorktreeDraftOptions {
  remote: string;
  provider: 'github' | 'gitlab';
  targetBranch: string;
  title: string;
  body: string;
}
export interface IWorktreeDraftResult {
  review: IWorktreeReview;
  existing: boolean;
  warning?: string;
}
