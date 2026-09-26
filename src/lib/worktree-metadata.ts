import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IWorktreeReview } from '@/types/worktree';

interface IMetadata { targetRef?: string; review?: IWorktreeReview }
type TMetadata = Record<string, IMetadata>;
const file = () => path.join(os.homedir(), '.purplemux', 'worktree-metadata.json');
export const worktreeMetadataKey = (repository: string, directory: string, branch: string | null) => JSON.stringify([repository, directory, branch]);
const readAll = async (): Promise<TMetadata> => {
  try {
    const data = JSON.parse(await fs.readFile(file(), 'utf8'));
    if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Invalid worktree metadata');
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
};
const global = globalThis as typeof globalThis & { __worktreeMetadataLock?: Promise<unknown> };
export const readWorktreeMetadata = async (key: string): Promise<IMetadata> => (await readAll())[key] ?? {};
export const updateWorktreeMetadata = async (key: string, updates: IMetadata) => {
  const write = async () => {
    const data = await readAll();
    data[key] = { ...data[key], ...updates };
    const destination = file();
    await fs.mkdir(path.dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
      await fs.rename(temporary, destination);
    } finally { await fs.rm(temporary, { force: true }); }
  };
  const next = (global.__worktreeMetadataLock ?? Promise.resolve()).then(write, write);
  global.__worktreeMetadataLock = next.catch(() => undefined);
  return next;
};
