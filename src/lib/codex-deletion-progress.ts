import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const state = globalThis as unknown as { __ptCodexDeletionLocks?: Map<string, Promise<void>> };
state.__ptCodexDeletionLocks ??= new Map();
const locks = state.__ptCodexDeletionLocks;

export const withCodexDeletionLock = async (sessionId: string, action: () => Promise<void>): Promise<void> => {
  const task = (locks.get(sessionId) ?? Promise.resolve()).then(action);
  const settled = task.then(() => {}, () => {});
  locks.set(sessionId, settled);
  try {
    await task;
  } finally {
    if (locks.get(sessionId) === settled) locks.delete(sessionId);
  }
};

const progressFile = (sessionId: string): string =>
  path.join(os.homedir(), '.purplemux', 'session-deletions', 'codex', `${sessionId}.json`);

export const readCodexDeletionProgress = async (sessionId: string): Promise<string[]> => {
  try {
    const data = JSON.parse(await fs.readFile(progressFile(sessionId), 'utf8'));
    if (data?.version !== 1 || !Array.isArray(data.pending)
      || !data.pending.every((id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id))
      || new Set(data.pending).size !== data.pending.length
      || (data.pending.length > 0 && data.pending.at(-1) !== sessionId)) {
      throw new Error('Invalid Codex deletion progress');
    }
    return data.pending;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

// Callers hold the parent lock through native deletion and record cleanup.
export const writeCodexDeletionProgress = async (sessionId: string, pending: string[]): Promise<void> => {
  const file = progressFile(sessionId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify({ version: 1, pending }), { mode: 0o600 });
  await fs.rename(`${file}.tmp`, file);
};

export const clearCodexDeletionProgress = async (sessionId: string): Promise<void> => {
  try { await fs.unlink(progressFile(sessionId)); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
};
