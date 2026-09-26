import type { IManagedWorktree, IWorktreeSize } from '@/types/worktree';

export interface IWorktreeFilter {
  query: string;
  idleDays: number;
  state: 'all' | 'eligible' | 'unknown';
  sort: 'recent' | 'oldest' | 'size';
}
export const filterWorktrees = (items: IManagedWorktree[], filter: IWorktreeFilter, sizes: Record<string, IWorktreeSize>, now = Date.now()) => {
  const query = filter.query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    if (query && ![item.branch, item.directory, ...item.workspaces.map((ws) => ws.name)].join('\n').toLocaleLowerCase().includes(query)) return false;
    const opened = item.lastOpenedAt ? Date.parse(item.lastOpenedAt) : NaN;
    if (filter.idleDays && (!Number.isFinite(opened) || now - opened < filter.idleDays * 86_400_000)) return false;
    if (filter.state === 'eligible' && item.blockers.length > 0) return false;
    if (filter.state === 'unknown' && Number.isFinite(opened)) return false;
    return true;
  }).sort((a, b) => {
    if (filter.sort === 'size') {
      const sizeA = sizes[a.directory]?.bytes ?? -1;
      const sizeB = sizes[b.directory]?.bytes ?? -1;
      if (sizeA !== sizeB) return sizeB - sizeA;
    }
    const timeA = a.lastOpenedAt ? Date.parse(a.lastOpenedAt) : NaN;
    const timeB = b.lastOpenedAt ? Date.parse(b.lastOpenedAt) : NaN;
    if (!Number.isFinite(timeA) && Number.isFinite(timeB)) return 1;
    if (Number.isFinite(timeA) && !Number.isFinite(timeB)) return -1;
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return filter.sort === 'oldest' ? timeA - timeB : timeB - timeA;
    return a.directory.localeCompare(b.directory);
  });
};
