import type { IAppUpdateState, IUpdatePreferences } from '@/types/app-update';
import { isNewerVersion, isStableVersion } from '@/lib/app-update-version';

interface IUpdateDependencies {
  currentVersion: string;
  supported: boolean;
  latest: () => Promise<string>;
  assertIdle: () => Promise<void>;
  download: (version: string) => Promise<string>;
  restart: (directory: string) => Promise<void>;
  preferences?: IUpdatePreferences;
}

export const createAppUpdateManager = (deps: IUpdateDependencies) => {
  let state: IAppUpdateState = {
    currentVersion: deps.currentVersion, latestVersion: null, skippedVersion: null, phase: 'idle',
    supported: deps.supported, progress: null, checkedAt: null, error: null,
  };
  let checkOperation: Promise<void> | null = null;
  let installOperation: Promise<void> | null = null;
  let skipOperation: Promise<void> | null = null;
  let downloaded: { version: string; directory: string } | null = null;
  const patch = (value: Partial<IAppUpdateState>) => { state = { ...state, ...value }; };
  const runCheck = async () => {
    if (downloaded || state.phase === 'restarting') return;
    patch({ phase: 'checking', error: null });
    try {
      const skippedVersion = await deps.preferences?.readSkippedVersion() ?? null;
      patch({ skippedVersion: isStableVersion(skippedVersion) ? skippedVersion : null });
      const latest = await deps.latest();
      if (!isStableVersion(latest)) throw new Error('Invalid stable release version');
      patch({ latestVersion: latest, checkedAt: Date.now(), phase: isNewerVersion(latest, deps.currentVersion) ? 'available' : 'idle' });
    } catch (error) {
      patch({ phase: 'error', latestVersion: null, error: error instanceof Error ? error.message : String(error) });
    }
  };
  const check = () => {
    if (skipOperation) return skipOperation.catch(() => {});
    if (installOperation) return installOperation;
    if (checkOperation) return checkOperation;
    checkOperation = runCheck().finally(() => { checkOperation = null; });
    return checkOperation;
  };
  const runInstall = async (options?: { force: true; version: string }) => {
    if (state.phase === 'restarting') return;
    if (!deps.supported) {
      patch({ phase: 'error', error: 'One-click upgrades require a production server started with purplemux-improved.' });
      return;
    }
    const version = state.latestVersion;
    if (options && (!isStableVersion(options.version) || options.version !== version)) {
      patch({ phase: 'error', error: 'Update version changed. Check for updates and confirm again.' });
      return;
    }
    if (!version || !isNewerVersion(version, deps.currentVersion)) return;
    patch({ phase: 'checking', error: null });
    try {
      if (!options?.force) await deps.assertIdle();
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
        if (!options?.force) await deps.assertIdle();
      } catch (error) {
        patch({ phase: 'blocked', error: String(error instanceof Error ? error.message : error) });
        return;
      }
      patch({ phase: 'restarting' });
      await deps.restart(downloaded.directory);
    } catch (error) {
      patch({ phase: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  };
  const install = (options?: { force: true; version: string }) => {
    if (skipOperation) return skipOperation.catch(() => {});
    if (installOperation) return installOperation;
    const pendingCheck = checkOperation;
    installOperation = (async () => {
      if (pendingCheck) await pendingCheck;
      await runInstall(options);
    })().finally(() => { installOperation = null; });
    return installOperation;
  };
  const skip = (version: string): Promise<void> => {
    if (skipOperation || checkOperation || installOperation || state.phase === 'restarting') {
      return Promise.reject(new Error('An update operation is already running. Retry when it finishes.'));
    }
    if (!isStableVersion(version) || version !== state.latestVersion || !isNewerVersion(version, deps.currentVersion)) {
      return Promise.reject(new Error('Update version changed. Check for updates and retry.'));
    }
    skipOperation = (async () => {
      if (!deps.preferences) throw new Error('Update preferences are unavailable');
      await deps.preferences.saveSkippedVersion(version);
      downloaded = null;
      patch({ skippedVersion: version, phase: 'available', error: null, progress: null });
    })().finally(() => { skipOperation = null; });
    return skipOperation;
  };
  return {
    getState: () => ({ ...state, installing: installOperation !== null || state.phase === 'restarting' }), check, install, skip,
    setProgress: (progress: number) => patch({ progress: Math.max(0, Math.min(100, progress)) }),
    setError: (error: string) => patch({ phase: 'error', error }),
  };
};

export type TAppUpdateManager = ReturnType<typeof createAppUpdateManager>;
