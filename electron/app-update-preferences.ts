import fs from 'node:fs/promises';
import path from 'node:path';
import type { IUpdatePreferences } from '../src/types/app-update';

export const createDesktopUpdatePreferences = (
  local: IUpdatePreferences,
  getLocalPort: () => Promise<number | null>,
  configDirectory: string,
): IUpdatePreferences => ({
  readSkippedVersion: local.readSkippedVersion,
  saveSkippedVersion: async (version) => {
    const port = await getLocalPort();
    if (port) {
      const token = (await fs.readFile(path.join(configDirectory, 'cli-token'), 'utf8')).trim();
      const response = await fetch(`http://127.0.0.1:${port}/api/app-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-purplemux-update': '1', 'x-pmux-token': token },
        body: JSON.stringify({ action: 'skip-desktop-version', version }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error('The local server could not save the skipped desktop version. Update the local server or retry later.');
      return;
    }
    try {
      await fs.access(path.join(configDirectory, 'pmux.lock'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      await local.saveSkippedVersion(version);
      return;
    }
    throw new Error('The local server is not ready. Retry saving the skipped version later.');
  },
});
