import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pkg from '../../package.json';
import { createAppUpdateManager, type TAppUpdateManager } from '@/lib/app-update-manager';
import { assertUpdateSessionsIdle } from '@/lib/app-update-guard';
import { isStableVersion } from '@/lib/app-update-version';
import { getSkippedAppVersion, saveSkippedAppVersion } from '@/lib/workspace-store';

const exec = promisify(execFile);
const REGISTRY = 'https://registry.npmjs.org';
const g = globalThis as unknown as {
  __ptAppUpdateManager?: TAppUpdateManager;
  __ptUpdateGuard?: () => Promise<void>;
};

export const downloadServerUpdate = async (version: string): Promise<string> => {
  if (!isStableVersion(version)) throw new Error('Invalid version');
  const updates = path.join(os.homedir(), '.purplemux', 'updates');
  await fs.mkdir(updates, { recursive: true });
  const staging = await fs.mkdtemp(path.join(updates, `${version}-`));
  // Keep the running installation intact until the replacement has started.
  await exec('npm', ['install', '--prefix', staging, '--registry', REGISTRY, '--omit=dev', '--no-audit', '--no-fund', '--ignore-scripts', `${pkg.name}@${version}`], {
    timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, npm_config_update_notifier: 'false' },
  });
  const directory = path.join(staging, 'node_modules', pkg.name);
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'));
  if (manifest.name !== pkg.name || manifest.version !== version) throw new Error('Downloaded package version mismatch');
  await Promise.all(['dist/server.js', '.next/standalone/server.js', 'bin/purplemux.js'].map((file) => fs.access(path.join(directory, file))));
  await exec(process.execPath, ['--check', path.join(directory, 'dist/server.js')], { timeout: 15_000 });
  return directory;
};

export const getAppUpdateManager = (): TAppUpdateManager | undefined => g.__ptAppUpdateManager;

export const initAppUpdates = () => {
  g.__ptUpdateGuard = assertUpdateSessionsIdle;
  if (g.__ptAppUpdateManager) return;
  g.__ptAppUpdateManager = createAppUpdateManager({
    currentVersion: pkg.version,
    supported: process.env.NODE_ENV === 'production' && process.env.__PMUX_SUPERVISED === '1' && !!process.send && !process.env.__PMUX_ELECTRON,
    latest: async () => {
      const response = await fetch(`${REGISTRY}/${pkg.name}/latest`, { signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`Update check failed: HTTP ${response.status}`);
      const data = await response.json();
      if (data.name !== pkg.name) throw new Error('Unexpected release package');
      return data.version;
    },
    assertIdle: assertUpdateSessionsIdle,
    preferences: {
      readSkippedVersion: () => getSkippedAppVersion('server'),
      saveSkippedVersion: (version) => saveSkippedAppVersion('server', version),
    },
    download: downloadServerUpdate,
    restart: async (directory) => {
      if (!process.send || !process.connected) throw new Error('Server supervisor is unavailable');
      await new Promise<void>((resolve, reject) => {
        process.send!({ type: 'purplemux:upgrade', directory }, (error: Error | null) => error ? reject(error) : resolve());
      });
    },
  });
  if (process.env.__PMUX_UPDATE_ERROR) g.__ptAppUpdateManager.setError(process.env.__PMUX_UPDATE_ERROR);
  process.on('message', (message: { type?: string; error?: string }) => {
    if (message?.type === 'purplemux:upgrade-error') g.__ptAppUpdateManager?.setError(message.error || 'Restart failed');
  });
  if (!process.env.__PMUX_ELECTRON) {
    const manager = g.__ptAppUpdateManager;
    if (!process.env.__PMUX_UPDATE_ERROR) setTimeout(() => void manager.check(), 3000).unref();
    setInterval(() => void manager.check(), 6 * 60 * 60 * 1000).unref();
  }
};
