import { useState } from 'react';
import useSWR from 'swr';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import IdleTabSettings from '@/components/features/settings/idle-tab-settings';
import type { IAgentProcessIdentity, IAgentProcessList } from '@/types/agent-process';
import { PROCESS_ACTION_HEADER } from '@/lib/process-action-request';

const endpoint = '/api/system/agent-processes';
const fetchProcesses = async (): Promise<IAgentProcessList> => {
  const response = await fetch(endpoint);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Unable to load processes');
  return data;
};

const AgentProcessSettings = () => {
  const t = useTranslations('settings.processes');
  const tc = useTranslations('common');
  const { data, error, isLoading, isValidating, mutate } = useSWR(endpoint, fetchProcesses, { refreshInterval: 10000 });
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<(IAgentProcessIdentity & { action: 'stop' | 'adopt' }) | null>(null);
  const openWorkspace = async (id: string) => {
    const store = useWorkspaceStore.getState();
    await store.fetchWorkspaces();
    store.switchWorkspace(id);
    store.setSettingsDialogOpen(false);
  };
  const execute = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', [PROCESS_ACTION_HEADER]: '1' },
        body: JSON.stringify({ ...pending, confirmed: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? t('failed'));
      toast.success(t(pending.action === 'stop' ? 'stopped' : 'started'));
      setPending(null);
      await mutate();
      if (result.workspaceId) await openWorkspace(result.workspaceId);
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : t('failed'));
      await mutate();
    } finally { setBusy(false); }
  };
  const needle = query.trim().toLocaleLowerCase();
  const processes = (data?.processes ?? []).filter((item) =>
    `${item.providerId} ${item.pid} ${item.cwd ?? ''} ${item.workspaceName ?? ''}`.toLocaleLowerCase().includes(needle));

  return (
    <div className="space-y-4" aria-busy={busy}>
      <IdleTabSettings />
      <p className="text-sm text-muted-foreground">{t('description')}</p>
      <div className="flex items-center gap-2">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} />
        <Button variant="outline" size="icon" disabled={isValidating || busy} onClick={() => void mutate()} aria-label={t('refresh')}>
          <RefreshCw className={isValidating ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
        </Button>
      </div>
      {error && <p role="alert" className="break-words text-sm text-negative">{t('failed')}: {error.message}</p>}
      {isLoading && <p role="status" className="text-sm text-muted-foreground">{t('loading')}</p>}
      {!isLoading && !error && !processes.length && <p className="text-sm text-muted-foreground">{t('empty')}</p>}
      {data?.transfers.map((item) => (
        <div key={`${item.pid}-${item.startedAt}`} className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">{t('unfinished')} · {item.providerId} · PID {item.pid}</p>
          <p className="break-all text-xs text-muted-foreground">{item.workspaceName} · {item.cwd}</p>
          <p className="break-all text-xs text-muted-foreground">{item.sessionId}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy || Boolean(error)} onClick={() => setPending({ pid: item.pid, startedAt: item.startedAt, action: 'adopt' })}>{t('retry')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void openWorkspace(item.workspaceId)}>{t('open')}</Button>
          </div>
        </div>
      ))}
      {processes.map((item) => (
        <div key={`${item.pid}-${item.startedAt}`} className="space-y-2 border-b py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">{item.providerId === 'claude' ? 'Claude Code' : 'Codex'}</span>
            <span className="text-muted-foreground">PID {item.pid}</span>
            <span className="text-xs text-muted-foreground">{t(item.managed ? 'managed' : 'external')}</span>
          </div>
          <p className="break-all text-xs text-muted-foreground">{item.cwd ?? t('unknownDirectory')}</p>
          <p className="text-xs text-muted-foreground">{dayjs(item.startedAt).format('YYYY-MM-DD HH:mm:ss')}{item.workspaceName && ` · ${item.workspaceName}`}</p>
          {item.session && <p className="break-all text-xs text-muted-foreground">{item.session.sessionId}</p>}
          {!item.managed && !item.session && <p className="text-xs text-muted-foreground">{t('unavailable')}</p>}
          <div className="flex flex-wrap gap-2">
            {item.workspaceId
              ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void openWorkspace(item.workspaceId!)}>{t('open')}</Button>
              : <Button size="sm" disabled={busy || Boolean(error) || !item.cwd || !item.session} onClick={() => setPending({ pid: item.pid, startedAt: item.startedAt, action: 'adopt' })}>{t('adopt')}</Button>}
            <Button variant="outline" size="sm" disabled={busy || Boolean(error)} onClick={() => setPending({ pid: item.pid, startedAt: item.startedAt, action: 'stop' })}>{t('stop')}</Button>
          </div>
        </div>
      ))}
      <AlertDialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(pending?.action === 'adopt' ? 'adopt' : 'stop')} · PID {pending?.pid}</AlertDialogTitle>
            <AlertDialogDescription>{t(pending?.action === 'adopt' ? 'adoptConfirm' : 'stopConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{tc('cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void execute(); }}>{busy ? t('working') : tc('confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AgentProcessSettings;
