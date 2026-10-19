import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { z } from 'zod';

dayjs.extend(utc);
dayjs.extend(timezone);

const timeZoneSchema = z.string().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
});
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const taskScheduleSchema = z.discriminatedUnion('frequency', [
  z.object({ frequency: z.literal('once'), at: z.iso.datetime({ offset: true }) }).strict(),
  z.object({ frequency: z.literal('daily'), time: timeSchema, timeZone: timeZoneSchema }).strict(),
  z.object({ frequency: z.literal('weekly'), time: timeSchema, timeZone: timeZoneSchema, weekday: z.number().int().min(0).max(6) }).strict(),
]);
export const scheduledTaskSchema = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(['shell', 'claude', 'codex']),
  cwd: z.string().min(1).max(4096).refine((value) => !value.includes('\0')),
  content: z.string().min(1).max(16000).refine((value) => !!value.trim() && !value.includes('\0')),
  timeoutMinutes: z.number().int().min(1).max(1440),
  enabled: z.boolean(),
  schedule: taskScheduleSchema,
}).strict();

export type TTaskSchedule = z.infer<typeof taskScheduleSchema>;
export type TScheduledTaskInput = z.infer<typeof scheduledTaskSchema>;
export type TTaskRunStatus = 'running' | 'succeeded' | 'failed' | 'timed-out' | 'interrupted' | 'skipped';
export interface ITaskRun {
  id: string;
  trigger: 'manual' | 'scheduled';
  startedAt: string;
  finishedAt?: string;
  status: TTaskRunStatus;
  output: string;
  truncated?: boolean;
  exitCode?: number | null;
  reason?: string;
}
export interface IScheduledTask extends TScheduledTaskInput {
  id: string;
  workspaceId: string;
  nextRunAt: string | null;
  runs: ITaskRun[];
}

export const MAX_SCHEDULED_TASKS = 50;
export const MAX_TASK_RUNS = 10;
export const TASK_OUTPUT_BYTES = 16 * 1024;
export const isTaskRunning = (task: IScheduledTask) => task.runs.some((run) => run.status === 'running');

export const nextTaskRun = (schedule: TTaskSchedule, after: number): string | null => {
  if (schedule.frequency === 'once') return Date.parse(schedule.at) > after ? new Date(schedule.at).toISOString() : null;
  const firstDay = dayjs(after).tz(schedule.timeZone).format('YYYY-MM-DD');
  // Include the following valid week when next week's local time is missing during DST.
  for (let offset = 0; offset < 15; offset++) {
    const date = dayjs.utc(firstDay).add(offset, 'day');
    if (schedule.frequency === 'weekly' && date.day() !== schedule.weekday) continue;
    const local = `${date.format('YYYY-MM-DD')}T${schedule.time}`;
    const guessed = dayjs.tz(local, schedule.timeZone);
    // Check both offsets around transitions; choose the first occurrence on a repeated day.
    const offsets = new Set([-1, 0, 1].map((days) => dayjs(guessed.valueOf() + days * 86400000).tz(schedule.timeZone).utcOffset()));
    const candidates = [...offsets].map((minutes) => dayjs.utc(local).valueOf() - minutes * 60000)
      .filter((value) => dayjs(value).tz(schedule.timeZone).format('YYYY-MM-DDTHH:mm') === local);
    if (candidates.length) {
      const first = Math.min(...candidates);
      if (first > after) return new Date(first).toISOString();
    }
  }
  return null;
};
