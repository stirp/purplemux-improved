import { createAppUpdateManager } from '../src/lib/app-update-manager';
import type { AppUpdater } from 'electron-updater';

export const createDesktopUpdater = (
  updater: AppUpdater,
  options: { version: string; supported: boolean; assertIdle: () => Promise<void>; restart: () => Promise<void>; prepareNative?: (version: string) => Promise<void> },
) => {
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  const manager = createAppUpdateManager({
    currentVersion: options.version,
    supported: options.supported,
    latest: async () => {
      if (!options.supported) throw new Error('Updates are only available in the packaged desktop app.');
      const result = await updater.checkForUpdates();
      if (!result) throw new Error('Update information is unavailable');
      return result.updateInfo.version;
    },
    assertIdle: options.assertIdle,
    download: async (version) => {
      await updater.downloadUpdate();
      return version;
    },
    restart: async (version) => {
      // Squirrel preparation arms installation on quit, so it must follow the final idle check.
      await options.prepareNative?.(version);
      await options.restart();
    },
  });
  updater.on('download-progress', ({ percent }) => manager.setProgress(percent));
  updater.on('error', (error) => {
    // checkForUpdates/downloadUpdate reject as well; preserve the operation lock.
    console.error('[updater]', error.message);
    if (manager.getState().phase === 'restarting') manager.setError(error.message);
  });
  return manager;
};
