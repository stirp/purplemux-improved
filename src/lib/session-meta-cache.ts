import fs from 'node:fs/promises';
import type { Stats } from 'node:fs';

interface ICacheEntry<T> {
  value: T;
  fingerprint: string;
}

export interface ISessionMetaCache<T> {
  read: (filePath: string, load: (stat: Stats) => Promise<T | null>) => Promise<T | null>;
  clear: () => void;
}

const fingerprint = (stat: Stats): string =>
  `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;

export const createSessionMetaCache = <T>(capacity = 2000): ISessionMetaCache<T> => {
  const cache = new Map<string, ICacheEntry<T>>();
  const pending = new Map<string, Promise<T | null>>();
  let generation = 0;

  const read = (filePath: string, load: (stat: Stats) => Promise<T | null>): Promise<T | null> => {
    const existing = pending.get(filePath);
    if (existing) return existing;
    const readGeneration = generation;
    const loadValue = async (): Promise<T | null> => {
      const stat = await fs.stat(filePath);
      const version = fingerprint(stat);
      const cached = cache.get(filePath);
      cache.delete(filePath);
      if (cached?.fingerprint === version) {
        cache.set(filePath, cached);
        return cached.value;
      }
      const value = await load(stat);
      const currentStat = value !== null ? await fs.stat(filePath) : null;
      if (value !== null && currentStat && readGeneration === generation && fingerprint(currentStat) === version) {
        cache.set(filePath, { value, fingerprint: version });
        while (cache.size > capacity) cache.delete(cache.keys().next().value!);
      }
      return value;
    };
    const result = loadValue().finally(() => {
      if (pending.get(filePath) === result) pending.delete(filePath);
    });
    pending.set(filePath, result);
    return result;
  };

  const clear = () => {
    generation++;
    cache.clear();
    pending.clear();
  };

  return { read, clear };
};
