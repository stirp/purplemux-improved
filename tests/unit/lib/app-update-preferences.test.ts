import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

vi.mock('@/lib/sync-server', () => ({ broadcastSync: vi.fn() }));
let root: string;
afterEach(() => { vi.restoreAllMocks(); });

it('persists independent server and desktop skipped versions while retaining workspace data', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-update-preferences-'));
  vi.spyOn(os, 'homedir').mockReturnValue(root);
  const directory = path.join(root, '.purplemux');
  await fs.mkdir(directory);
  const file = path.join(directory, 'workspaces.json');
  const workspace = { id: 'ws-one', name: 'One', directories: [root] };
  await fs.writeFile(file, JSON.stringify({ workspaces: [workspace], groups: [], sidebarCollapsed: false, sidebarWidth: 240 }));
  const { getSkippedAppVersion, saveSkippedAppVersion, updateActive } = await import('@/lib/workspace-store');
  expect(await getSkippedAppVersion('server')).toBeNull();
  await Promise.all([saveSkippedAppVersion('server', '0.6.0'), saveSkippedAppVersion('desktop', '0.7.0'), updateActive({ sidebarWidth: 280 })]);
  expect(await getSkippedAppVersion('server')).toBe('0.6.0');
  expect(await getSkippedAppVersion('desktop')).toBe('0.7.0');
  expect(JSON.parse(await fs.readFile(file, 'utf8'))).toMatchObject({
    workspaces: [workspace], sidebarWidth: 280, skippedAppVersions: { server: '0.6.0', desktop: '0.7.0' },
  });
  await expect(saveSkippedAppVersion('server', 'bad')).rejects.toThrow('Invalid');
  vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('disk full'));
  await expect(saveSkippedAppVersion('server', '0.8.0')).rejects.toThrow('disk full');
  expect(await getSkippedAppVersion('server')).toBe('0.6.0');
  await saveSkippedAppVersion('server', '0.8.0');
  expect(await getSkippedAppVersion('server')).toBe('0.8.0');
  await fs.writeFile(file, '{broken');
  await expect(saveSkippedAppVersion('server', '0.9.0')).rejects.toThrow();
  expect(await fs.readFile(file, 'utf8')).toBe('{broken');
});
