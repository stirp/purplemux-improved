import type { ITaskItem, ITimelineEntry, TTaskStatus } from '@/types/timeline';

export const parseTaskSnapshot = (value: unknown): ITaskItem[] | null => {
  if (!Array.isArray(value)) return null;
  const tasks: ITaskItem[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') return null;
    const subject = item.content ?? item.step ?? item.subject ?? item.title ?? item.description;
    if (typeof subject !== 'string' || !subject.trim()) return null;
    const status: TTaskStatus = ['in_progress', 'completed', 'blocked'].includes(item.status) ? item.status : 'pending';
    tasks.push({ taskId: String(item.task_id ?? item.id ?? tasks.length + 1), subject, status });
  }
  return tasks;
};

export const collectTimelineTasks = (entries: ITimelineEntry[]): ITaskItem[] => {
  const tasks = new Map<string, ITaskItem>();
  const failedCalls = new Set(entries.flatMap((entry) => entry.type === 'tool-result' && entry.isError ? [entry.toolUseId] : []));
  let createIndex = 0;
  for (const entry of entries) {
    if (entry.type !== 'task-progress') continue;
    if (entry.toolUseId && failedCalls.has(entry.toolUseId)) continue;
    if (entry.action === 'replace') {
      const prefix = `${entry.source}:`;
      for (const key of tasks.keys()) if (key.startsWith(prefix)) tasks.delete(key);
      for (const task of entry.tasks ?? []) tasks.set(`${prefix}${task.taskId}`, { ...task, taskId: `${prefix}${task.taskId}` });
      continue;
    }
    if (entry.action === 'create') createIndex++;
    const taskId = entry.taskId || String(createIndex);
    const previous = tasks.get(taskId);
    // Tail/incremental reads can start with an update rather than a creation.
    if (!previous && !entry.subject) continue;
    tasks.set(taskId, {
      taskId, subject: entry.subject ?? previous?.subject ?? '',
      description: entry.description ?? previous?.description, status: entry.status,
    });
  }
  return [...tasks.values()];
};
