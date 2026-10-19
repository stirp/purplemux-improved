import { describe, expect, it } from 'vitest';
import { nextTaskRun, scheduledTaskSchema } from '@/lib/scheduled-tasks';

describe('scheduled task calendar', () => {
  it('handles future and elapsed one-time tasks', () => {
    const schedule = { frequency: 'once' as const, at: '2026-10-20T09:00:00+08:00' };
    expect(nextTaskRun(schedule, Date.parse('2026-10-19T00:00:00Z'))).toBe('2026-10-20T01:00:00.000Z');
    expect(nextTaskRun(schedule, Date.parse(schedule.at))).toBeNull();
  });
  it('uses the configured zone across days and weeks', () => {
    const daily = { frequency: 'daily' as const, time: '09:00', timeZone: 'Asia/Shanghai' };
    expect(nextTaskRun(daily, Date.parse('2026-10-19T00:59:59Z'))).toBe('2026-10-19T01:00:00.000Z');
    expect(nextTaskRun(daily, Date.parse('2026-10-19T01:00:00Z'))).toBe('2026-10-20T01:00:00.000Z');
    expect(nextTaskRun({ ...daily, frequency: 'weekly', weekday: 1 }, Date.parse('2026-10-19T01:00:00Z'))).toBe('2026-10-26T01:00:00.000Z');
  });
  it('skips nonexistent times and chooses only the first repeated time', () => {
    expect(nextTaskRun({ frequency: 'daily', time: '02:30', timeZone: 'America/New_York' }, Date.parse('2026-03-08T05:00:00Z'))).toBe('2026-03-09T06:30:00.000Z');
    const fall = { frequency: 'daily' as const, time: '01:30', timeZone: 'America/New_York' };
    expect(nextTaskRun(fall, Date.parse('2026-11-01T04:00:00Z'))).toBe('2026-11-01T05:30:00.000Z');
    expect(nextTaskRun(fall, Date.parse('2026-11-01T05:30:00Z'))).toBe('2026-11-02T06:30:00.000Z');
  });
  it('handles fractional-offset zones', () => {
    expect(nextTaskRun({ frequency: 'daily', time: '09:00', timeZone: 'Asia/Kathmandu' }, Date.parse('2026-10-19T00:00:00Z'))).toBe('2026-10-19T03:15:00.000Z');
  });
  it.each(['2026-03-01T07:30:00Z', '2026-03-02T00:00:00Z', '2026-03-08T00:00:00Z'])(
    'continues weekly schedules past a missing DST occurrence after %s', (after) => {
      expect(nextTaskRun({ frequency: 'weekly', weekday: 0, time: '02:30', timeZone: 'America/New_York' }, Date.parse(after)))
        .toBe('2026-03-15T06:30:00.000Z');
    },
  );
  it('rejects invalid configuration and unknown fields', () => {
    const valid = { name: ' Task ', kind: 'shell', cwd: '/tmp', content: 'printf ok', timeoutMinutes: 30, enabled: true, schedule: { frequency: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' } };
    expect(scheduledTaskSchema.parse(valid).name).toBe('Task');
    for (const change of [{ content: ' ' }, { content: '\0' }, { timeoutMinutes: 0 }, { timeoutMinutes: 1441 }, { kind: 'unknown' }, { enabled: 'true' }, { extra: true },
      { schedule: { frequency: 'once', at: '2026-10-19T09:00' } }, { schedule: { frequency: 'weekly', time: '25:00', timeZone: 'UTC', weekday: 7 } },
      { schedule: { frequency: 'daily', time: '09:00', timeZone: 'invalid/zone' } }]) {
      expect(scheduledTaskSchema.safeParse({ ...valid, ...change }).success).toBe(false);
    }
  });
});
