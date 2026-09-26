export interface IWorktreeStatus {
  modified: number;
  staged: number;
  untracked: number;
  ignored: number;
  conflicts: number;
  upstream: string | null;
  ahead: number | null;
  behind: number | null;
}

export type TWorktreeBlocker = 'main' | 'locked' | 'missing' | 'unknown' | 'dirty' | 'ignored' | 'sessions' | 'detached' | 'sharedWorkspace';

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
  targetRef?: string;
}

export interface IRemoveWorktreeResult {
  removedWorkspaceIds: string[];
  warnings: string[];
}
