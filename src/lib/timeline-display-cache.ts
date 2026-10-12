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
  const bounded = { ...snapshot, entries: confirmed.slice(Math.max(0, lastUser)) };
  snapshots.delete(key);
  if (bounded.entries.length === 0 || JSON.stringify(bounded).length * 2 > MAX_SNAPSHOT_BYTES) return;
  snapshots.set(key, { snapshot: bounded, savedAt: Date.now() });
  while (snapshots.size > MAX_SESSIONS) snapshots.delete(snapshots.keys().next().value!);
};
