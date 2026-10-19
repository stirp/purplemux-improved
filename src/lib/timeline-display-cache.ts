import type { IInitMeta, ISessionStats, ITimelineEntry } from '@/types/timeline';

interface ITimelineDisplaySnapshot {
  entries: ITimelineEntry[];
  sessionId: string;
  summary?: string;
  meta?: IInitMeta;
  stats: ISessionStats | null;
}

const MAX_SESSIONS = 12;
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024;
const TTL_MS = 5 * 60_000;
const snapshots = new Map<string, { snapshot: ITimelineDisplaySnapshot; savedAt: number }>();
const sizes = new WeakMap<object, number>();

// Timeline entries are immutable. Count conservatively without allocating JSON strings.
const estimateBytes = (value: unknown, depth = 0): number => {
  if (typeof value === 'string') return value.length * 12 + 4;
  if (!value || typeof value !== 'object') return 32;
  if (depth > 64) return MAX_SNAPSHOT_BYTES + 1;
  const cached = sizes.get(value);
  if (cached !== undefined) return cached;
  let size = 4;
  for (const key in value) {
    if (!Object.hasOwn(value, key)) continue;
    size += key.length * 12 + 8 + estimateBytes((value as Record<string, unknown>)[key], depth + 1);
    if (size > MAX_SNAPSHOT_BYTES) break;
  }
  sizes.set(value, size);
  return size;
};

const withoutToolOutput = (entry: ITimelineEntry): ITimelineEntry => {
  if (entry.type === 'agent-group') return { ...entry, entries: entry.entries.map(withoutToolOutput) };
  if (entry.type !== 'tool-result' || entry.output === undefined) return entry;
  const result = { ...entry, outputTruncated: true };
  delete result.output;
  result.outputFormat = 'text';
  return result;
};

export const timelineDisplayKey = (panelType: string, sessionName: string, sessionId?: string | null): string | null =>
  sessionId ? JSON.stringify([panelType, sessionName, sessionId]) : null;

export const getTimelineDisplaySnapshot = (key: string | null): ITimelineDisplaySnapshot | undefined => {
  if (!key) return;
  const cached = snapshots.get(key);
  if (!cached) return;
  if (Date.now() - cached.savedAt >= TTL_MS) {
    snapshots.delete(key);
    return;
  }
  snapshots.delete(key);
  snapshots.set(key, cached);
  return cached.snapshot;
};

export const clearTimelineDisplaySnapshot = (key: string | null): void => {
  if (key) snapshots.delete(key);
};

export const saveTimelineDisplaySnapshot = (key: string | null, snapshot: ITimelineDisplaySnapshot): void => {
  if (!key) return;
  const confirmed = snapshot.entries.filter((entry) => entry.type !== 'user-message' || !entry.pending);
  const lastUser = confirmed.findLastIndex((entry) => entry.type === 'user-message');
  let bounded = { ...snapshot, entries: confirmed.slice(Math.max(0, lastUser)) };
  if (estimateBytes(bounded) > MAX_SNAPSHOT_BYTES) {
    bounded = { ...bounded, entries: bounded.entries.map(withoutToolOutput) };
  }
  if (estimateBytes(bounded) > MAX_SNAPSHOT_BYTES) {
    let size = estimateBytes({ ...bounded, entries: [] });
    const entries: ITimelineEntry[] = [];
    for (let i = bounded.entries.length - 1; i >= 0; i--) {
      const entrySize = estimateBytes(bounded.entries[i]) + 128;
      if (size + entrySize > MAX_SNAPSHOT_BYTES) break;
      entries.push(bounded.entries[i]);
      size += entrySize;
    }
    bounded = { ...bounded, entries: entries.reverse() };
  }
  if (bounded.entries.length === 0 || estimateBytes(bounded) > MAX_SNAPSHOT_BYTES) return;
  snapshots.delete(key);
  snapshots.set(key, { snapshot: bounded, savedAt: Date.now() });
  while (snapshots.size > MAX_SESSIONS) snapshots.delete(snapshots.keys().next().value!);
};
