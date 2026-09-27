import { useSyncExternalStore } from 'react';
import type { TDiffViewMode } from '@/types/terminal';

const STORAGE_KEY = 'diff-view-mode';
const subscribers = new Set<() => void>();
let fallbackMode: TDiffViewMode | undefined;

const getSnapshot = (): TDiffViewMode => {
  if (fallbackMode) return fallbackMode;
  try {
    return localStorage.getItem(STORAGE_KEY) === 'split' ? 'split' : 'unified';
  } catch { return 'unified'; }
};

const getServerSnapshot = (): TDiffViewMode => 'unified';

const subscribe = (onChange: () => void) => {
  subscribers.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== STORAGE_KEY) return;
    fallbackMode = undefined;
    onChange();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    subscribers.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
};

const setViewMode = (mode: TDiffViewMode) => {
  fallbackMode = mode;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    fallbackMode = undefined;
  }
  catch { /* Keep the selection in memory if browser storage is unavailable. */ }
  for (const onChange of subscribers) onChange();
};

const useDiffViewMode = () => {
  const viewMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [viewMode, setViewMode] as const;
};

export default useDiffViewMode;
