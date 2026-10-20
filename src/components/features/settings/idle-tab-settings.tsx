import { useState } from 'react';
import useSWR from 'swr';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { idleTabPolicySchema, type TIdleTabPolicy, type IIdleTabPreview, type IIdleTabResult, type TIdleTabTarget } from '@/lib/idle-tab-policy';
import { PROCESS_ACTION_HEADER } from '@/lib/process-action-request';

const endpoint = '/api/system/idle-tabs';
const request = async (method: string, body?: unknown) => {
  const response = await fetch(endpoint, { method, headers: { 'Content-Type': 'application/json', [PROCESS_ACTION_HEADER]: '1' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? 'Idle tab operation failed');
  return result;
};

const PolicyForm = ({ policy, onSave }: { policy: TIdleTabPolicy; onSave: () => Promise<unknown> }) => {
  const t = useTranslations('settings.idleTabs');
  const { register, handleSubmit, control, setValue, formState: { errors, isSubmitting, isDirty } } = useForm<TIdleTabPolicy>({
    resolver: zodResolver(idleTabPolicySchema), defaultValues: policy,
  });
  const enabled = useWatch({ control, name: 'enabled' });
  const save = handleSubmit(async (values) => {
    try {
      await request('PATCH', values);
      await onSave();
      toast.success(t('saved'));
    } catch (error) { toast.error(error instanceof Error ? error.message : t('failed')); }
  });
  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="idle-tabs-enabled" className="text-sm">{t('automatic')}</label>
        <Switch id="idle-tabs-enabled" checked={enabled} disabled={isSubmitting}
          onCheckedChange={(checked) => setValue('enabled', checked, { shouldDirty: true })} />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label htmlFor="idle-tabs-minutes" className="text-xs">{t('timeout')}</label>
          <Input id="idle-tabs-minutes" type="number" min={15} max={10080} step={1} className="w-36"
            disabled={isSubmitting} {...register('idleMinutes', { valueAsNumber: true })} />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={isSubmitting || !isDirty}>{t('save')}</Button>
      </div>
      {errors.idleMinutes && <p role="alert" className="text-xs text-negative">{t('range')}</p>}
    </form>
  );
};

const IdleTabSettings = () => {
  const t = useTranslations('settings.idleTabs');
  const tc = useTranslations('common');
  const { data, error, isValidating, mutate } = useSWR<IIdleTabPreview>(endpoint, () => request('GET'), { refreshInterval: 60000 });
  const [pending, setPending] = useState<{ targets: TIdleTabTarget[]; policy: TIdleTabPolicy } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IIdleTabResult | null>(null);
  const execute = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const next: IIdleTabResult = await request('POST', { ...pending, confirmed: true });
      setResult(next);
      setPending(null);
      await mutate();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : t('failed')); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-3 rounded-md border p-3" aria-busy={busy}>
      <h3 className="text-sm font-medium">{t('title')}</h3>
      <p className="text-xs text-muted-foreground">{t('description')}</p>
      {data && <PolicyForm key={`${data.policy.enabled}-${data.policy.idleMinutes}`} policy={data.policy} onSave={mutate} />}
      {error && <p role="alert" className="break-words text-sm text-negative">{t('failed')}: {error.message}</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={isValidating || busy} onClick={() => void mutate()}>{t('refresh')}</Button>
        <Button size="sm" disabled={busy || Boolean(error) || !data?.candidates.length} onClick={() => {
          if (!data) return;
          setPending({ policy: { ...data.policy }, targets: data.candidates.slice(0, 100).map(({ workspaceId, paneId, tabId, sessionId, lastActivityAt }) =>
            ({ workspaceId, paneId, tabId, sessionId, lastActivityAt })) });
        }}>{t('reclaim')}</Button>
      </div>
      {data && !error && !data.candidates.length && <p className="text-xs text-muted-foreground">{t('empty')}</p>}
      {data?.candidates.map((item) => (
        <div key={item.tabId} className="space-y-1 border-t pt-2 text-xs">
          <p className="break-words">{item.workspaceName} · {item.tabName} · {item.providerId}</p>
          <p className="break-all text-muted-foreground">{item.cwd}</p>
          <p className="text-muted-foreground">{t('idleFor', { minutes: Math.floor((Date.now() - item.lastActivityAt) / 60000) })}</p>
        </div>
      ))}
      {result && <div role="status" className="space-y-1 text-xs">
        <p>{t('result', { reclaimed: result.reclaimed.length, skipped: result.skipped.length })}</p>
        {result.skipped.map((item, index) => <p className="break-all" key={index}>{item.target.tabId}: {item.reason}</p>)}
      </div>}
      <AlertDialog open={Boolean(pending)} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirmTitle', { count: pending?.targets.length ?? 0 })}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void execute(); }}>{tc('confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};

export default IdleTabSettings;
