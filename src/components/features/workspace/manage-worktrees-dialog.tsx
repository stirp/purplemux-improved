import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GitBranch, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspace } from '@/types/terminal';
import type { IManagedWorktree, IWorktreeOverview, IWorktreeSize, TWorktreeSnapshot } from '@/types/worktree';
import { filterWorktrees, type IWorktreeFilter } from '@/lib/worktree-filter';
import { requestWorktreeAction } from '@/lib/worktree-action-client';
import WorktreeCleanupDialog from '@/components/features/workspace/worktree-cleanup-dialog';
import WorktreeDeliveryDialog from '@/components/features/workspace/worktree-delivery-dialog';
import WorktreeIgnoredNotice from '@/components/features/workspace/worktree-ignored-notice';

interface ISelection { repositoryId: string; item: IManagedWorktree }

export default function ManageWorktreesDialog({ workspace, onClose, onSelect }: {
  workspace: IWorkspace; onClose: () => void; onSelect: (id: string) => void;
}) {
  const t = useTranslations('workspace.worktreeManager');
  const tc = useTranslations('common');
  const [overview, setOverview] = useState<IWorktreeOverview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [selection, setSelection] = useState<ISelection | null>(null);
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [targetRef, setTargetRef] = useState('');
  const [filter, setFilter] = useState<IWorktreeFilter>({ query: '', idleDays: 0, state: 'all', sort: 'recent' });
  const [sizes, setSizes] = useState<Record<string, IWorktreeSize>>({});
  const [selected, setSelected] = useState<TWorktreeSnapshot[]>([]);
  const [batch, setBatch] = useState(false);
  const [delivery, setDelivery] = useState<TWorktreeSnapshot | null>(null);
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  useEffect(() => {
    if (busy || selection || batch || delivery) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await fetch(`/api/workspace/worktrees?workspaceId=${encodeURIComponent(workspace.id)}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!controller.signal.aborted) { setOverview(data); setError(''); }
      } catch (error) {
        if (!controller.signal.aborted) { setOverview(null); setError(error instanceof Error ? error.message : String(error)); }
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(load, 10_000);
      }
    };
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [workspace.id, refresh, busy, selection, batch, delivery]);

  const snapshot = (repositoryId: string, item: IManagedWorktree): TWorktreeSnapshot => ({ repositoryId, directory: item.directory, head: item.head, branch: item.branch });
  const measure = async (repositoryId: string, item: IManagedWorktree) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await requestWorktreeAction<IWorktreeSize>(workspace.id, 'measure', { item: snapshot(repositoryId, item) });
      setSizes((sizes) => ({ ...sizes, [item.directory]: result }));
    } catch (error) {
      const failure = error as Error & { code?: string };
      setError(failure.code ? t(`reasons.${failure.code}`) : failure.message);
    }
    finally { setBusy(false); }
  };

  const mutate = useCallback(async (method: 'POST' | 'DELETE', chosen: ISelection) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const store = useWorkspaceStore.getState();
      if (method === 'POST') {
        const adopted = await store.adoptWorktree(workspace.id, chosen.repositoryId, chosen.item.directory);
        onSelect(adopted.id);
        onClose();
      } else {
        const data = await store.removeWorktree(workspace.id, {
          repositoryId: chosen.repositoryId, directory: chosen.item.directory,
          head: chosen.item.head, branch: chosen.item.branch, deleteBranch,
          confirmedIgnoredPaths: chosen.item.status?.ignoredPaths ?? [],
          ...(deleteBranch ? { targetRef: targetRef.trim() } : {}),
        });
        for (const warning of data.warnings) toast.warning(t(warning));
        toast.success(t('deleted'));
        setSelection(null);
        if (data.removedWorkspaceIds.includes(workspace.id)) onClose();
        else setRefresh((value) => value + 1);
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      setError(code ? t(`reasons.${code}`) : error instanceof Error ? error.message : String(error));
    } finally { setBusy(false); }
  }, [busy, workspace.id, deleteBranch, targetRef, t, onSelect, onClose]);

  if (delivery) return <WorktreeDeliveryDialog workspaceId={workspace.id} item={delivery} onClose={() => { setDelivery(null); setRefresh((value) => value + 1); }} />;
  if (batch) return <WorktreeCleanupDialog workspaceId={workspace.id} items={selected} onClose={() => { setBatch(false); setSelected([]); setRefresh((value) => value + 1); }} />;

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl" showCloseButton={!busy}>
      <DialogHeader>
        <DialogTitle>{t('title')} · {workspace.name}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="break-all text-ui-red">{error}</p>}
      {selection ? <div className="flex flex-col gap-4">
        <p className="font-medium">{t('confirmDelete')}</p>
        <p className="break-all font-mono text-xs">{selection.item.directory}</p>
        <p>{t('deleteNotice', { count: selection.item.workspaces.length })}</p>
        <WorktreeIgnoredNotice paths={selection.item.status?.ignoredPaths ?? []} />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={deleteBranch} disabled={busy} onChange={(event) => setDeleteBranch(event.target.checked)} />
          {t('deleteBranch', { branch: selection.item.branch ?? 'HEAD' })}
        </label>
        {deleteBranch && <label className="flex flex-col gap-2">{t('targetRef')}
          <Input value={targetRef} onChange={(event) => setTargetRef(event.target.value)} placeholder="refs/heads/main" disabled={busy} />
          <span className="text-xs text-muted-foreground">{t('mergeNotice')}</span>
        </label>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => { setSelection(null); setError(''); }}>{tc('cancel')}</Button>
          <Button variant="destructive" disabled={busy || (deleteBranch && !targetRef.trim())} onClick={() => void mutate('DELETE', selection)}>{busy ? t('working') : t('delete')}</Button>
        </div>
      </div> : <>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{t('refreshHint')}</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => setRefresh((value) => value + 1)}><RefreshCw className="h-4 w-4" />{t('refresh')}</Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Input aria-label={t('searchWorktrees')} placeholder={t('searchWorktrees')} value={filter.query} onChange={(event) => setFilter({ ...filter, query: event.target.value })} />
          <select aria-label={t('idleFilter')} className="rounded border bg-background p-2" value={filter.idleDays} onChange={(event) => setFilter({ ...filter, idleDays: Number(event.target.value) })}>
            <option value={0}>{t('anyTime')}</option>
            {[7, 30, 90].map((days) => <option key={days} value={days}>{t('idleDays', { days })}</option>)}
          </select>
          <select aria-label={t('stateFilter')} className="rounded border bg-background p-2" value={filter.state} onChange={(event) => setFilter({ ...filter, state: event.target.value as IWorktreeFilter['state'] })}>
            <option value="all">{t('allWorktrees')}</option><option value="eligible">{t('eligible')}</option><option value="unknown">{t('openedUnknown')}</option>
          </select>
          <select aria-label={t('sortWorktrees')} className="rounded border bg-background p-2" value={filter.sort} onChange={(event) => setFilter({ ...filter, sort: event.target.value as IWorktreeFilter['sort'] })}>
            <option value="recent">{t('sortRecent')}</option><option value="oldest">{t('sortOldest')}</option><option value="size">{t('sortSize')}</option>
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" disabled={busy || !selected.length || !overview} onClick={() => setBatch(true)}>{t('previewCleanup', { count: selected.length })}</Button>
          {selected.length > 0 && <Button variant="ghost" disabled={busy} onClick={() => setSelected([])}>{t('clearSelection')}</Button>}
          <span className="text-xs text-muted-foreground">{t('organizationHint')}</span>
        </div>
        {!overview && !error && <p role="status">{t('loading')}</p>}
        {overview?.errors.map((item) => <p role="alert" key={item.directory} className="break-all text-ui-red">{item.directory}: {item.error}</p>)}
        {overview && overview.repositories.length === 0 && <p>{t('empty')}</p>}
        {overview?.repositories.map((repository) => {
          const visible = filterWorktrees(repository.worktrees, filter, sizes);
          return <section key={repository.id} className="flex flex-col gap-3">
          <p className="break-all text-xs font-medium text-muted-foreground">{repository.directory}</p>
          {visible.length === 0 && <p className="text-sm text-muted-foreground">{t('noMatches')}</p>}
          {visible.map((item) => <article key={item.directory} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex min-w-0 items-center gap-2 font-medium">
                <input type="checkbox" aria-label={t('selectWorktree', { branch: item.branch ?? item.directory })}
                  checked={selected.some((chosen) => chosen.directory === item.directory && chosen.repositoryId === repository.id)}
                  disabled={busy || item.main || item.workspaces.some((ws) => ws.id === workspace.id) || (selected.length >= 50 && !selected.some((chosen) => chosen.directory === item.directory))}
                  onChange={(event) => setSelected(event.target.checked ? [...selected, snapshot(repository.id, item)] : selected.filter((chosen) => chosen.directory !== item.directory || chosen.repositoryId !== repository.id))} />
                <GitBranch className="h-4 w-4 shrink-0" /><span className="break-all">{item.branch ?? t('detached')}</span>{item.main && <span className="text-xs text-muted-foreground">{t('main')}</span>}
              </label>
              <div className="flex flex-wrap gap-2">
                {item.workspaces.map((linked) => <Button key={linked.id} variant="outline" size="sm" disabled={busy || item.missing || !item.status} onClick={() => { onSelect(linked.id); onClose(); }}>
                  {linked.id === activeWorkspaceId ? t('current') : t('open')} · {linked.name}
                </Button>)}
                {!item.workspaces.length && <Button variant="outline" size="sm" disabled={busy || !item.status || item.missing} onClick={() => void mutate('POST', { repositoryId: repository.id, item })}>{t('adopt')}</Button>}
                <Button variant="outline" size="sm" disabled={busy || !item.status} onClick={() => setDelivery(snapshot(repository.id, item))}>{t('deliveryTitle')}</Button>
                {!item.main && <Button variant="outline" size="sm" disabled={busy || item.blockers.length > 0} onClick={() => { setSelection({ repositoryId: repository.id, item }); setDeleteBranch(false); setTargetRef(''); setError(''); }}>{t('delete')}</Button>}
              </div>
            </div>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{item.directory}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{t('lastOpened')}: {item.lastOpenedAt ? new Date(item.lastOpenedAt).toLocaleString() : t('openedUnknown')}</span>
              <Button variant="ghost" size="sm" disabled={busy || !item.status} onClick={() => void measure(repository.id, item)}>{t('measureSize')}</Button>
              {sizes[item.directory] && <span title={t('checkedAt', { time: new Date(sizes[item.directory].measuredAt).toLocaleString() })}>{t(sizes[item.directory].complete ? 'sizeValue' : 'sizePartial', { size: (sizes[item.directory].bytes / 1024 / 1024).toFixed(1) })}</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {item.status ? <>
                <span>{t('changes', { staged: item.status.staged, modified: item.status.modified, untracked: item.status.untracked, conflicts: item.status.conflicts })}</span>
                {item.status.ignored > 0 && <span>{t('ignoredCount', { count: item.status.ignored })}</span>}
                <span>{item.status.upstream ? t('upstream', { ref: item.status.upstream, ahead: item.status.ahead ?? '?', behind: item.status.behind ?? '?' }) : t('noUpstream')}</span>
              </> : <span>{t('unknown')}</span>}
              <span>{item.sessions === null ? t('sessionsUnknown') : t('sessions', { count: item.sessions.length })}</span>
              {item.prunable && <span>{t('prunable')}</span>}
            </div>
            {!item.main && item.blockers.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{t('blocked')}: {item.blockers.map((reason) => t(`reasons.${reason}`)).join(' · ')}</p>}
            {item.error && <p className="mt-2 break-all text-xs text-ui-red">{item.error}</p>}
          </article>)}
        </section>; })}
      </>}
    </DialogContent>
  </Dialog>;
}
