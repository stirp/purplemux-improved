import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GitBranch, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspace } from '@/types/terminal';
import type { IManagedWorktree, IWorktreeOverview } from '@/types/worktree';

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
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);

  useEffect(() => {
    if (busy || selection) return;
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
  }, [workspace.id, refresh, busy, selection]);

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
        {!overview && !error && <p role="status">{t('loading')}</p>}
        {overview?.errors.map((item) => <p role="alert" key={item.directory} className="break-all text-ui-red">{item.directory}: {item.error}</p>)}
        {overview && overview.repositories.length === 0 && <p>{t('empty')}</p>}
        {overview?.repositories.map((repository) => <section key={repository.id} className="flex flex-col gap-3">
          <p className="break-all text-xs font-medium text-muted-foreground">{repository.directory}</p>
          {repository.worktrees.map((item) => <article key={item.directory} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex min-w-0 items-center gap-2 font-medium"><GitBranch className="h-4 w-4 shrink-0" /><span className="break-all">{item.branch ?? t('detached')}</span>{item.main && <span className="text-xs text-muted-foreground">{t('main')}</span>}</p>
              <div className="flex flex-wrap gap-2">
                {item.workspaces.map((linked) => <Button key={linked.id} variant="outline" size="sm" disabled={busy || item.missing || !item.status} onClick={() => { onSelect(linked.id); onClose(); }}>
                  {linked.id === activeWorkspaceId ? t('current') : t('open')} · {linked.name}
                </Button>)}
                {!item.workspaces.length && <Button variant="outline" size="sm" disabled={busy || !item.status || item.missing} onClick={() => void mutate('POST', { repositoryId: repository.id, item })}>{t('adopt')}</Button>}
                {!item.main && <Button variant="outline" size="sm" disabled={busy || item.blockers.length > 0} onClick={() => { setSelection({ repositoryId: repository.id, item }); setDeleteBranch(false); setTargetRef(''); setError(''); }}>{t('delete')}</Button>}
              </div>
            </div>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{item.directory}</p>
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
        </section>)}
      </>}
    </DialogContent>
  </Dialog>;
}
