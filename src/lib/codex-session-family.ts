import fs from 'fs/promises';
import { createReadStream } from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';

interface ICodexSessionIdentity {
  id?: string;
  source?: unknown;
  parent_thread_id?: string;
  forked_from_id?: string;
}

const asObject = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;

export const isCodexSubagent = (source: unknown): boolean => {
  const object = asObject(source);
  return !!object && 'subagent' in object;
};

const parentId = (meta: ICodexSessionIdentity): string | null => {
  if (!isCodexSubagent(meta.source)) return null;
  const subagent = asObject(asObject(meta.source)?.subagent);
  const spawn = asObject(subagent?.thread_spawn);
  const parent = meta.parent_thread_id ?? spawn?.parent_thread_id ?? meta.forked_from_id;
  return typeof parent === 'string' ? parent : null;
};

const readIdentity = async (file: string): Promise<ICodexSessionIdentity | null> => {
  const stream = createReadStream(file, { encoding: 'utf8' });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      try {
        const entry = JSON.parse(line);
        return entry?.type === 'session_meta' ? entry.payload : null;
      } catch { return null; }
    }
    return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  } finally {
    lines.close();
    stream.destroy();
  }
};

// A review can outlive its parent rollout; scan both roots without a date/cwd limit.
export const collectCodexSessionFamily = async (sessionId: string): Promise<string[]> => {
  const children = new Map<string, Set<string>>();
  const scan = async (directory: string): Promise<void> => {
    let entries;
    try { entries = await fs.readdir(directory, { withFileTypes: true }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(file);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        const meta = await readIdentity(file);
        if (!meta || typeof meta.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(meta.id)) continue;
        const parent = parentId(meta);
        if (!parent) continue;
        if (!children.has(parent)) children.set(parent, new Set());
        children.get(parent)!.add(meta.id);
      }
    }
  };
  const root = path.join(os.homedir(), '.codex');
  await scan(path.join(root, 'sessions'));
  await scan(path.join(root, 'archived_sessions'));

  const ordered: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const child of children.get(id) ?? []) visit(child);
    ordered.push(id);
  };
  visit(sessionId);
  return ordered;
};
