import type { IAppUpdateState } from '@/types/app-update';
import { isNewerVersion, isStableVersion } from '@/lib/app-update-version';

interface IUpdateDependencies {
  currentVersion: string;
  supported: boolean;
  latest: () => Promise<string>;
  assertIdle: () => Promise<void>;
  download: (version: string) => Promise<string>;
  restart: (directory: string) => Promise<void>;
}

export const createAppUpdateManager = (deps: IUpdateDependencies) => {
  let state: IAppUpdateState = {
    currentVersion: deps.currentVersion, latestVersion: null, phase: 'idle',
    supported: deps.supported, progress: null, checkedAt: null, error: null,
  };
  let operation: Promise<void> | null = null;
  let downloaded: { version: string; directory: string } | null = null;
  const patch = (value: Partial<IAppUpdateState>) => { state = { ...state, ...value }; };
  const exclusive = (run: () => Promise<void>) => {
    if (operation) return operation;
    operation = run().finally(() => { operation = null; });
    return operation;
  };
  const check = () => exclusive(async () => {
    if (downloaded || state.phase === 'restarting') return;
    patch({ phase: 'checking', error: null });
    try {
      const latest = await deps.latest();
      if (!isStableVersion(latest)) throw new Error('Invalid stable release version');
      patch({ latestVersion: latest, checkedAt: Date.now(), phase: isNewerVersion(latest, deps.currentVersion) ? 'available' : 'idle' });
    } catch (error) {
      patch({ phase: 'error', latestVersion: null, error: error instanceof Error ? error.message : String(error) });
    }
  });
  const install = () => exclusive(async () => {
    if (state.phase === 'restarting') return;
    if (!deps.supported) {
      patch({ phase: 'error', error: 'One-click upgrades require a production server started with purplemux-improved.' });
      return;
    }
    const version = state.latestVersion;
    if (!version || !isNewerVersion(version, deps.currentVersion)) return;
    patch({ error: null });
    try {
      await deps.assertIdle();
    } catch (error) {
      patch({ phase: 'blocked', error: String(error instanceof Error ? error.message : error) });
      return;
    }
    try {
      if (!downloaded) {
        patch({ phase: 'downloading', progress: null });
        downloaded = { version, directory: await deps.download(version) };
      }
      patch({ phase: 'ready' });
      try {
        await deps.assertIdle();
      } catch (error) {
        patch({ phase: 'blocked', error: String(error instanceof Error ? error.message : error) });
        return;
      }
      patch({ phase: 'restarting' });
      await deps.restart(downloaded.directory);
    } catch (error) {
      patch({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  });
  return {
    getState: () => ({ ...state }), check, install,
    setProgress: (progress: number) => patch({ progress: Math.max(0, Math.min(100, progress)) }),
    setError: (error: string) => patch({ phase: 'error', error }),
  };
};

export type TAppUpdateManager = ReturnType<typeof createAppUpdateManager>;
