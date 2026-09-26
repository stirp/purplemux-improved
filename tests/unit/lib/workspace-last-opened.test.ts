import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
vi.mock('@/lib/sync-server', () => ({ broadcastSync: vi.fn() }));
let root: string;
afterEach(async () => { vi.restoreAllMocks(); if (root) await fs.rm(root, { recursive: true, force: true }); });
it('records explicit workspace opens without inventing history for old entries or sidebar changes', async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-opened-'));
  vi.spyOn(os, 'homedir').mockReturnValue(root);
  const directory = path.join(root, '.purplemux'); await fs.mkdir(directory);
  const file = path.join(directory, 'workspaces.json');
  await fs.writeFile(file, JSON.stringify({ workspaces: [
    { id: 'ws-one', name: 'One', directories: [root] }, { id: 'ws-two', name: 'Two', directories: [root] },
  ], groups: [], sidebarCollapsed: false, sidebarWidth: 240 }));
  const { updateActive, getWorkspaceById } = await import('@/lib/workspace-store');
  await updateActive({ sidebarWidth: 250 });
  expect((await getWorkspaceById('ws-one'))?.lastOpenedAt).toBeUndefined();
  const before = Date.now();
  await updateActive({ activeWorkspaceId: 'ws-one' });
  expect(Date.parse((await getWorkspaceById('ws-one'))!.lastOpenedAt!)).toBeGreaterThanOrEqual(before);
  expect((await getWorkspaceById('ws-two'))?.lastOpenedAt).toBeUndefined();
  await updateActive({ activeWorkspaceId: 'ws-missing' });
  expect(JSON.parse(await fs.readFile(file, 'utf8')).activeWorkspaceId).toBe('ws-one');
});
