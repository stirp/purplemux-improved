export type TUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'blocked' | 'restarting' | 'error';

export interface IAppUpdateState {
  currentVersion: string;
  latestVersion: string | null;
  phase: TUpdatePhase;
  supported: boolean;
  progress: number | null;
  checkedAt: number | null;
  error: string | null;
}
