export interface ICommitSnapshot {
  directory: string;
  branch: string;
  head: string | null;
  tree: string;
}

export interface ICommitPreview {
  snapshot: ICommitSnapshot;
  files: string[];
}

export interface IGeneratedCommit extends ICommitPreview {
  title: string;
  body: string;
  truncated: boolean;
}

export interface ICommitResult {
  head: string;
  output: string;
  warning?: string;
}
