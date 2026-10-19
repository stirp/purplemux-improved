import { nanoid } from 'nanoid';
import { mutateScheduledTasks } from '@/lib/workspace-store';
import { nextTaskRun, isTaskRunning, MAX_TASK_RUNS, type IScheduledTask, type ITaskRun } from '@/lib/scheduled-tasks';
import { executeScheduledTask, type TTaskExecution } from '@/lib/scheduled-task-runner';
import { taskError } from '@/lib/scheduled-task-service';
import { createLogger } from '@/lib/logger';

const log = createLogger('scheduled-tasks');
const advance = (task: IScheduledTask, now: number) => {
  task.nextRunAt = nextTaskRun(task.schedule, now);
  if (!task.nextRunAt) task.enabled = false;
};
const addRun = (task: IScheduledTask, trigger: ITaskRun['trigger'], now: number, reason?: string) => {
  const run: ITaskRun = { id: nanoid(), trigger, startedAt: new Date(now).toISOString(), status: reason ? 'skipped' : 'running', output: '',
    ...(reason ? { finishedAt: new Date(now).toISOString(), reason } : {}) };
  // Keep a running record even when many automatic occurrences are skipped.
  const entries = [run, ...task.runs];
  let remaining = MAX_TASK_RUNS - entries.filter((entry) => entry.status === 'running').length;
  task.runs = entries.filter((entry) => entry.status === 'running' || remaining-- > 0);
  return run;
};

export class ScheduledTaskScheduler {
  private timer?: ReturnType<typeof setInterval>;
  private accepting = false;
  private active = new Map<string, { controller: AbortController; done: Promise<void> }>();
  private pendingResults = new Map<string, { taskId: string; result: TTaskExecution & { finishedAt: string } }>();
  private claims = new Set<Promise<unknown>>();
  private ticking = false;

  constructor(private execute = executeScheduledTask) {}

  start = async () => {
    if (this.timer) return;
    await this.flushResults();
    const now = Date.now();
    await mutateScheduledTasks((tasks, workspaces) => {
      for (const task of tasks) {
        for (const run of task.runs) {
          if (run.status === 'running') Object.assign(run, { status: 'interrupted', finishedAt: new Date(now).toISOString(), reason: 'restart' });
        }
        if (!workspaces.some((workspace) => workspace.id === task.workspaceId)) {
          task.enabled = false; task.nextRunAt = null;
        } else if (task.enabled && task.nextRunAt && Date.parse(task.nextRunAt) <= now) {
          addRun(task, 'scheduled', now, 'offline'); advance(task, now);
        }
      }
    });
    this.accepting = true;
    this.timer = setInterval(() => { void this.tick().catch((error) => log.error({ error }, 'Scheduler tick failed')); }, 15000);
    this.timer.unref();
  };

  private launch = (task: IScheduledTask, run: ITaskRun) => {
    const controller = new AbortController();
    if (!this.accepting) controller.abort();
    const done = (async () => {
      let result: TTaskExecution;
      try { result = await this.execute(task, controller.signal); }
      catch (error) { result = { status: 'failed', output: '', reason: String(error).slice(0, 1000) }; }
      this.pendingResults.set(run.id, { taskId: task.id, result: { ...result, finishedAt: new Date().toISOString() } });
      await this.flushResults();
    })().catch((error) => log.error({ error, taskId: task.id }, 'Unable to save task result'))
      .finally(() => this.active.delete(run.id));
    this.active.set(run.id, { controller, done });
  };

  private flushResults = async () => {
    const pending = [...this.pendingResults];
    if (!pending.length) return;
    await mutateScheduledTasks((tasks) => {
      for (const [runId, { taskId, result }] of pending) {
        const saved = tasks.find((task) => task.id === taskId)?.runs.find((run) => run.id === runId);
        if (saved?.status === 'running') Object.assign(saved, result);
      }
    });
    // Drop results only after the complete atomic write succeeds.
    for (const [runId, entry] of pending) {
      if (this.pendingResults.get(runId) === entry) this.pendingResults.delete(runId);
    }
  };

  private track = async <T>(operation: () => Promise<T>): Promise<T> => {
    const pending = operation();
    this.claims.add(pending);
    try { return await pending; } finally { this.claims.delete(pending); }
  };

  runNow = (workspaceId: string, id: string) => this.track(async () => {
    await this.flushResults();
    const claimed = await mutateScheduledTasks((tasks, workspaces) => {
      if (!this.accepting) throw taskError('unavailable', 503);
      const task = tasks.find((entry) => entry.id === id && entry.workspaceId === workspaceId);
      if (!task || !workspaces.some((workspace) => workspace.id === workspaceId)) throw taskError('notFound', 404);
      if (isTaskRunning(task)) throw taskError('running', 409);
      if (tasks.filter(isTaskRunning).length >= 4) throw taskError('capacity', 409);
      const run = addRun(task, 'manual', Date.now());
      return { task: structuredClone(task), run };
    });
    this.launch(claimed.task, claimed.run);
    return claimed.run;
  });

  tick = async () => {
    if (!this.accepting || this.ticking) return;
    this.ticking = true;
    try {
      await this.track(async () => {
        await this.flushResults();
        const claimed = await mutateScheduledTasks((tasks, workspaces) => {
          if (!this.accepting) return [];
          const now = Date.now();
          let running = tasks.filter(isTaskRunning).length;
          const selected: { task: IScheduledTask; run: ITaskRun }[] = [];
          for (const task of tasks) {
            if (!task.enabled || !task.nextRunAt || Date.parse(task.nextRunAt) > now) continue;
            if (!workspaces.some((workspace) => workspace.id === task.workspaceId)) { task.enabled = false; task.nextRunAt = null; continue; }
            const reason = now - Date.parse(task.nextRunAt) > 60000 ? 'offline' : isTaskRunning(task) ? 'overlap' : running >= 4 ? 'capacity' : undefined;
            advance(task, now);
            const run = addRun(task, 'scheduled', now, reason);
            if (!reason) { selected.push({ task: structuredClone(task), run }); running++; }
          }
          return selected;
        });
        for (const claim of claimed) this.launch(claim.task, claim.run);
      });
    } finally { this.ticking = false; }
  };

  stop = async () => {
    this.accepting = false;
    clearInterval(this.timer);
    this.timer = undefined;
    for (const execution of this.active.values()) execution.controller.abort();
    await Promise.allSettled([...this.claims]);
    for (const execution of this.active.values()) execution.controller.abort();
    await Promise.allSettled([...this.active.values()].map((execution) => execution.done));
    await this.flushResults().catch((error) => log.error({ error }, 'Unable to save pending task results on shutdown'));
  };
}

const g = globalThis as unknown as { __ptScheduledTaskScheduler?: ScheduledTaskScheduler };
export const getScheduledTaskScheduler = () => g.__ptScheduledTaskScheduler ??= new ScheduledTaskScheduler();
