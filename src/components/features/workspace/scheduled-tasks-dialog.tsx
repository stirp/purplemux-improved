import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { z } from 'zod';
import { Clock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { scheduledTaskSchema, isTaskRunning, type IScheduledTask, type TScheduledTaskInput, type TTaskSchedule } from '@/lib/scheduled-tasks';
import type { IWorkspace } from '@/types/terminal';

const formSchema = z.object({
  name: scheduledTaskSchema.shape.name,
  kind: scheduledTaskSchema.shape.kind,
  cwd: scheduledTaskSchema.shape.cwd,
  content: scheduledTaskSchema.shape.content,
  timeoutMinutes: scheduledTaskSchema.shape.timeoutMinutes,
  enabled: z.boolean(), frequency: z.enum(['once', 'daily', 'weekly']),
  at: z.string(), time: z.string(), timeZone: z.string(), weekday: z.number(),
}).superRefine((value, ctx) => {
  const task = formToTask(value);
  if (!task || !scheduledTaskSchema.safeParse(task).success) ctx.addIssue({ code: 'custom', path: ['frequency'], message: 'invalid' });
});
type TTaskForm = z.infer<typeof formSchema>;
const formToTask = (value: TTaskForm): TScheduledTaskInput | null => {
  const { frequency, at, time, timeZone, weekday, ...task } = value;
  if (frequency === 'once' && !dayjs(at).isValid()) return null;
  const schedule: TTaskSchedule = frequency === 'once' ? { frequency, at: dayjs(at).toISOString() }
    : frequency === 'weekly' ? { frequency, time, timeZone, weekday } : { frequency, time, timeZone };
  return { ...task, schedule };
};
const fetchTasks = async (url: string): Promise<IScheduledTask[]> => {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('storage');
  return response.json();
};
const selectClass = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';

const TaskEditor = ({ task, workspace, onSave, onCancel, busy }: {
  task?: IScheduledTask; workspace: IWorkspace; onSave: (value: TScheduledTaskInput) => Promise<void>; onCancel: () => void; busy: boolean;
}) => {
  const t = useTranslations('workspace.scheduledTasks');
  const { register, watch, handleSubmit, formState: { errors } } = useForm<TTaskForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: task?.name ?? '', kind: task?.kind ?? 'shell', cwd: task?.cwd ?? workspace.directories[0] ?? '', content: task?.content ?? '',
      enabled: task?.enabled ?? true, timeoutMinutes: task?.timeoutMinutes ?? 30,
      frequency: task?.schedule.frequency ?? 'daily',
      at: dayjs(task?.schedule.frequency === 'once' ? task.schedule.at : Date.now() + 3600000).format('YYYY-MM-DDTHH:mm'),
      time: task?.schedule.frequency !== 'once' && task?.schedule.time || '09:00',
      timeZone: task?.schedule.frequency !== 'once' && task?.schedule.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      weekday: task?.schedule.frequency === 'weekly' ? task.schedule.weekday : 1,
    },
  });
  const frequency = watch('frequency');
  const kind = watch('kind');
  return <form onSubmit={handleSubmit(async (value) => { const parsed = formToTask(value); if (parsed) await onSave(parsed); })} className="space-y-4">
    <fieldset disabled={busy} className="min-w-0 space-y-4">
      <label className="block space-y-1"> <span>{t('name')}</span><Input {...register('name')} maxLength={80} aria-invalid={!!errors.name} autoFocus /></label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1"><span>{t('kind')}</span><select {...register('kind')} className={selectClass}>
          <option value="shell">Shell</option><option value="claude">Claude Code</option><option value="codex">Codex</option>
        </select></label>
        <label className="block space-y-1"><span>{t('timeout')}</span><Input type="number" min={1} max={1440} {...register('timeoutMinutes', { valueAsNumber: true })} aria-invalid={!!errors.timeoutMinutes} /></label>
      </div>
      <label className="block space-y-1"><span>{t('cwd')}</span><Input {...register('cwd')} aria-invalid={!!errors.cwd} /></label>
      <label className="block space-y-1"><span>{t(kind === 'shell' ? 'command' : 'prompt')}</span><Textarea {...register('content')} rows={5} maxLength={16000} className="max-h-64 font-mono" aria-invalid={!!errors.content} /></label>
      {kind !== 'shell' && <p className="text-xs text-muted-foreground">{t('agentHint')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1"><span>{t('frequency')}</span><select {...register('frequency')} className={selectClass}>
          {(['once', 'daily', 'weekly'] as const).map((value) => <option key={value} value={value}>{t(value)}</option>)}
        </select></label>
        {frequency === 'once' ? <label className="block min-w-0 space-y-1"><span>{t('at')}</span><Input type="datetime-local" {...register('at')} /><span className="text-xs text-muted-foreground">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span></label>
          : <label className="block space-y-1"><span>{t('time')}</span><Input type="time" {...register('time')} /></label>}
        {frequency !== 'once' && <label className="block space-y-1"><span>{t('timeZone')}</span><Input {...register('timeZone')} placeholder="Asia/Shanghai" /></label>}
        {frequency === 'weekly' && <label className="block space-y-1"><span>{t('weekday')}</span><select {...register('weekday', { valueAsNumber: true })} className={selectClass}>
          {Array.from({ length: 7 }, (_, day) => <option key={day} value={day}>{t(`days.${day}`)}</option>)}
        </select></label>}
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" {...register('enabled')} />{t('enabled')}</label>
    </fieldset>
    {Object.keys(errors).length > 0 && <p role="alert" className="text-ui-red">{t('errors.invalid')}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel} disabled={busy}>{t('cancel')}</Button><Button type="submit" disabled={busy}>{t('save')}</Button></div>
  </form>;
};

const ScheduledTasksDialog = ({ workspace, onClose }: { workspace: IWorkspace; onClose: () => void }) => {
  const t = useTranslations('workspace.scheduledTasks');
  const url = `/api/scheduled-tasks?workspaceId=${encodeURIComponent(workspace.id)}`;
  const { data: tasks, error: loadError, mutate } = useSWR(url, fetchTasks, { refreshInterval: 4000 });
  const [editor, setEditor] = useState<IScheduledTask | 'new' | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = async (method: string, body: unknown) => {
    setBusy(true); setError('');
    try {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'storage');
      void mutate();
      toast.success(t(method === 'PATCH' && (body as { action?: string }).action === 'run' ? 'started' : 'saved'));
      return true;
    } catch (failure) {
      const code = failure instanceof Error ? failure.message : 'storage';
      setError(t(`errors.${['invalid', 'directory', 'past', 'running', 'capacity', 'limit', 'notFound', 'unavailable'].includes(code) ? code : 'storage'}`));
      return false;
    } finally { setBusy(false); }
  };
  const timestamp = (value: string) => dayjs(value).format('YYYY-MM-DD HH:mm:ss Z');
  const scheduleText = (schedule: TTaskSchedule) => schedule.frequency === 'once' ? timestamp(schedule.at)
    : `${t(schedule.frequency)} ${schedule.frequency === 'weekly' ? t(`days.${schedule.weekday}`) + ' ' : ''}${schedule.time} (${schedule.timeZone})`;

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle className="flex items-center gap-2 pr-6"><Clock size={18} />{t('title')}</DialogTitle><DialogDescription className="break-words">{workspace.name} · {t('description')}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-ui-red">{error}</p>}
      {editor ? <TaskEditor key={typeof editor === 'string' ? editor : editor.id} task={typeof editor === 'string' ? undefined : editor} workspace={workspace} busy={busy}
        onCancel={() => { setEditor(null); setError(''); }} onSave={async (value) => {
          if (await request(editor === 'new' ? 'POST' : 'PUT', editor === 'new' ? value : { id: editor.id, task: value })) setEditor(null);
        }} /> : <>
        <div className="flex justify-end"><Button onClick={() => { setEditor('new'); setError(''); }} disabled={busy || !!loadError}><Plus size={16} />{t('add')}</Button></div>
        {loadError && <div role="alert" className="flex items-center justify-between gap-2 text-ui-red">{t('errors.storage')}<Button variant="outline" onClick={() => void mutate()}>{t('retry')}</Button></div>}
        {!tasks && !loadError && <p className="text-muted-foreground">{t('loading')}</p>}
        {tasks?.length === 0 && <p className="py-8 text-center text-muted-foreground">{t('empty')}</p>}
        <div className="space-y-3">{tasks?.map((task) => <article key={task.id} className="min-w-0 space-y-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-words">{task.name}</strong><span className="text-xs text-muted-foreground">{task.kind === 'shell' ? 'Shell' : task.kind === 'claude' ? 'Claude Code' : 'Codex'} · {t(task.enabled ? 'enabled' : 'paused')}</span></div>
          <p className="break-words text-xs text-muted-foreground">{scheduleText(task.schedule)}<br />{t('next')}: {task.nextRunAt ? timestamp(task.nextRunAt) : '—'}</p>
          <p className="break-all text-xs text-muted-foreground">{task.cwd}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy || isTaskRunning(task)} onClick={() => void request('PATCH', { id: task.id, action: 'run' })}>{t(isTaskRunning(task) ? 'statuses.running' : 'run')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void request('PATCH', { id: task.id, action: task.enabled ? 'pause' : 'enable' })}>{t(task.enabled ? 'pause' : 'enable')}</Button>
            <Button size="sm" variant="ghost" disabled={busy || isTaskRunning(task)} onClick={() => { setEditor(task); setError(''); }}>{t('edit')}</Button>
            <Button size="sm" variant="ghost" className="text-ui-red" disabled={busy || isTaskRunning(task)} onClick={() => setDeleting(task.id)}>{t('delete')}</Button>
          </div>
          {deleting === task.id && <div className="flex flex-wrap items-center gap-2 rounded border p-2"><span>{t('confirmDelete')}</span><Button size="sm" variant="destructive" disabled={busy} onClick={async () => { if (await request('DELETE', { id: task.id })) setDeleting(null); }}>{t('delete')}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleting(null)}>{t('cancel')}</Button></div>}
          <details className="text-xs"><summary className="cursor-pointer py-1">{t('history')} ({task.runs.length}){task.runs[0] && ` · ${t(`statuses.${task.runs[0].status}`)}`}</summary>
            <div className="mt-2 space-y-3">{task.runs.map((run) => <div key={run.id} className="min-w-0 space-y-1 border-t pt-2">
              <p>{t(`statuses.${run.status}`)} · {t(run.trigger)} · {timestamp(run.startedAt)}</p>
              {run.finishedAt && <p>{t('finished')}: {timestamp(run.finishedAt)}{run.exitCode !== undefined && ` · ${t('exitCode')}: ${run.exitCode ?? '—'}`}</p>}
              {run.reason && <p className="break-all text-muted-foreground">{run.reason}</p>}
              {run.truncated && <p className="text-ui-amber">{t('truncated')}</p>}
              {run.output && <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted p-2 font-mono">{run.output}</pre>}
            </div>)}</div>
          </details>
        </article>)}</div>
      </>}
    </DialogContent>
  </Dialog>;
};
export default ScheduledTasksDialog;
