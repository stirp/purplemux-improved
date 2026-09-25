import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const file = path.join(os.homedir(), '.purplemux', 'hidden-sessions.json');
const state = globalThis as unknown as { __purplemuxHiddenSessionsLock?: Promise<void> };

export const sessionHistoryKey = (provider: 'claude' | 'codex', sessionId: string) => `${provider}:${sessionId}`;

export const readHiddenSessions = async (): Promise<Set<string>> => {
  try {
    const data: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(data) || !data.every((key) => typeof key === 'string')) throw new Error('Invalid hidden session history');
    return new Set(data);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Set();
    throw error;
  }
};

export const hideSession = (provider: 'claude' | 'codex', sessionId: string): Promise<void> => {
  const update = (state.__purplemuxHiddenSessionsLock ?? Promise.resolve()).then(async () => {
    const hidden = await readHiddenSessions();
    const key = sessionHistoryKey(provider, sessionId);
    if (hidden.has(key)) return;
    hidden.add(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify([...hidden], null, 2), { mode: 0o600 });
    await fs.rename(`${file}.tmp`, file);
  });
  state.__purplemuxHiddenSessionsLock = update.catch(() => {});
  return update;
};
