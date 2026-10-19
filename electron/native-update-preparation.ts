import type { AutoUpdater } from 'electron';

export const createNativeUpdatePreparation = (updater: AutoUpdater) => {
  let preparedVersion: string | null = null;
  return async (version: string): Promise<void> => {
    if (preparedVersion === version) return;
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        updater.removeListener('update-downloaded', downloaded);
        updater.removeListener('error', failed);
      };
      const downloaded = () => {
        cleanup();
        preparedVersion = version;
        resolve();
      };
      const failed = (error: Error) => { cleanup(); reject(error); };
      const timer = setTimeout(() => failed(new Error('Native update preparation timed out')), 120_000);
      updater.once('update-downloaded', downloaded);
      updater.once('error', failed);
      try { updater.checkForUpdates(); } catch (error) { failed(error as Error); }
    });
  };
};
