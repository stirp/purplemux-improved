export type TUpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'blocked' | 'restarting' | 'error';
export type TAppUpdateAction = 'check' | 'install' | 'force-install' | 'skip';
export type TAppUpdateTarget = 'server' | 'desktop';

export interface IUpdatePreferences {
  readSkippedVersion: () => Promise<string | null>;
  saveSkippedVersion: (version: string) => Promise<void>;
}

export interface IAppUpdateState {
  currentVersion: string;
  latestVersion: string | null;
  skippedVersion?: string | null;
  installing?: boolean;
  phase: TUpdatePhase;
  supported: boolean;
  progress: number | null;
  checkedAt: number | null;
  error: string | null;
}
