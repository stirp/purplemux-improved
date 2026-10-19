import { nanoid } from 'nanoid';
import { mutateScheduledTasks, readScheduledTasks } from '@/lib/workspace-store';
import { scheduledTaskSchema, nextTaskRun, isTaskRunning, MAX_SCHEDULED_TASKS, type TScheduledTaskInput } from '@/lib/scheduled-tasks';
import { validateTaskDirectory } from '@/lib/scheduled-task-runner';

export const taskError = (code: string, status: number) => Object.assign(new Error(code), { code, status });

export const listScheduledTasks = async (workspaceId: string) =>
  (await readScheduledTasks()).filter((task) => task.workspaceId === workspaceId);

export const saveScheduledTask = async (workspaceId: string, input: TScheduledTaskInput, id?: string) => {
  const parsed = scheduledTaskSchema.safeParse(input);
  if (!parsed.success) throw taskError('invalid', 400);
  const value = parsed.data;
  await validateTaskDirectory(value.cwd);
  return mutateScheduledTasks((tasks, workspaces) => {
    if (!workspaces.some((workspace) => workspace.id === workspaceId)) throw taskError('notFound', 404);
    const task = id ? tasks.find((entry) => entry.id === id && entry.workspaceId === workspaceId) : undefined;
    if (id && !task) throw taskError('notFound', 404);
    if (task && isTaskRunning(task)) throw taskError('running', 409);
    const nextRunAt = value.enabled ? nextTaskRun(value.schedule, Date.now()) : null;
    if (value.enabled && !nextRunAt) throw taskError('past', 400);
    if (task) Object.assign(task, value, { nextRunAt });
    else {
      if (tasks.length >= MAX_SCHEDULED_TASKS) throw taskError('limit', 409);
      tasks.push({ ...value, id: nanoid(), workspaceId, nextRunAt, runs: [] });
    }
    return tasks.filter((entry) => entry.workspaceId === workspaceId);
  });
};

export const changeScheduledTask = async (workspaceId: string, id: string, action: 'delete' | 'enable' | 'pause') =>
  mutateScheduledTasks((tasks) => {
    const index = tasks.findIndex((task) => task.id === id && task.workspaceId === workspaceId);
    if (index < 0) throw taskError('notFound', 404);
    const task = tasks[index];
    if (action === 'delete') {
      if (isTaskRunning(task)) throw taskError('running', 409);
      tasks.splice(index, 1);
    } else {
      const nextRunAt = action === 'enable' ? nextTaskRun(task.schedule, Date.now()) : null;
      if (action === 'enable' && !nextRunAt) throw taskError('past', 400);
      task.enabled = action === 'enable';
      task.nextRunAt = nextRunAt;
    }
    return tasks.filter((entry) => entry.workspaceId === workspaceId);
  });
