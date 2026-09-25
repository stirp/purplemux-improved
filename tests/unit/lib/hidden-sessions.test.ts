import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = vi.hoisted(() => new Map<string, string>());
vi.mock('fs/promises', () => ({ default: {
  readFile: vi.fn(async (file: string) => {
    if (!files.has(file)) throw Object.assign(new Error('Missing'), { code: 'ENOENT' });
    return files.get(file)!;
  }),
  mkdir: vi.fn(async () => {}),
  writeFile: vi.fn(async (file: string, contents: string) => { files.set(file, contents); }),
  rename: vi.fn(async (from: string, to: string) => { files.set(to, files.get(from)!); files.delete(from); }),
} }));
import fs from 'fs/promises';
import { hideSession, readHiddenSessions, sessionHistoryKey } from '@/lib/hidden-sessions';

beforeEach(() => { files.clear(); vi.clearAllMocks(); });

describe('hidden session history', () => {
  it('starts empty and keeps Claude and Codex session identifiers separate', async () => {
    expect(await readHiddenSessions()).toEqual(new Set());
    await hideSession('claude', 'same-id');
    const hidden = await readHiddenSessions();
    expect(hidden.has(sessionHistoryKey('claude', 'same-id'))).toBe(true);
    expect(hidden.has(sessionHistoryKey('codex', 'same-id'))).toBe(false);
    expect([...files.keys()].every((file) => file.endsWith('hidden-sessions.json'))).toBe(true);
  });

  it('serializes concurrent removals without losing entries and ignores duplicates', async () => {
    await Promise.all([hideSession('claude', 'one'), hideSession('codex', 'two'), hideSession('claude', 'one')]);
    expect(await readHiddenSessions()).toEqual(new Set(['claude:one', 'codex:two']));
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
  });

  it('does not overwrite an unreadable history file', async () => {
    vi.mocked(fs.readFile).mockRejectedValueOnce(Object.assign(new Error('Permission denied'), { code: 'EACCES' }));
    await expect(hideSession('claude', 'one')).rejects.toThrow('Permission denied');
    expect(fs.writeFile).not.toHaveBeenCalled();
    await hideSession('codex', 'two');
    expect(await readHiddenSessions()).toEqual(new Set(['codex:two']));
  });
});
