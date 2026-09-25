import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => new Map<string, string>());
vi.mock('fs/promises', () => ({ default: {
  readFile: vi.fn(async (file: string) => {
    if (!files.has(file)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
    return files.get(file)!;
  }),
  writeFile: vi.fn(async (file: string, contents: string) => { files.set(file, contents); }),
  rename: vi.fn(async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); }),
  unlink: vi.fn(async () => {}),
} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
import os from 'os';
import path from 'path';
import { getSessionHistory, removeSessionHistory } from '@/lib/session-history';

const file = path.join(os.homedir(), '.purplemux', 'session-history.json');
const entry = (id: string, providerId = 'claude', agentSessionId: string | null = 'same') => ({
  id, tabId: id, workspaceId: id, providerId, agentSessionId,
});
beforeEach(() => {
  files.clear();
  (globalThis as { __purplemuxSessionHistoryContentCache?: string }).__purplemuxSessionHistoryContentCache = undefined;
  files.set(file, JSON.stringify({ version: 1, entries: [
    entry('turn-1'), entry('turn-2'), entry('other-provider', 'codex'),
    entry('legacy-1', 'claude', null), entry('legacy-2', 'claude', null),
  ] }));
});

describe('global session history removal', () => {
  it('persists removal of every turn across workspaces and keeps other providers', async () => {
    await removeSessionHistory('claude', 'same');
    expect((await getSessionHistory()).map((item) => item.id)).toEqual(['other-provider', 'legacy-1', 'legacy-2']);
  });
  it('removes only the selected entry when no native session ID exists', async () => {
    await removeSessionHistory('claude', null, 'legacy-1');
    expect((await getSessionHistory()).map((item) => item.id)).toEqual(['turn-1', 'turn-2', 'other-provider', 'legacy-2']);
  });
  it('serializes concurrent deletions without restoring deleted entries', async () => {
    await Promise.all([removeSessionHistory('claude', 'same'), removeSessionHistory('codex', 'same')]);
    expect((await getSessionHistory()).map((item) => item.id)).toEqual(['legacy-1', 'legacy-2']);
  });
});
