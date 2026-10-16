import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import WorktreeIgnoredNotice from '@/components/features/workspace/worktree-ignored-notice';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspace } from '@/types/terminal';
import type { IWorktreeOverview } from '@/types/worktree';

export default function DeleteWorkspaceDialog({ workspace, onClose, onDeleteProject }: {
  workspace: IWorkspace;
  onClose: () => void;
  onDeleteProject?: () => Promise<boolean>;
}) {
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');
  const tw = useTranslations('workspace');
  const tm = useTranslations('workspace.worktreeManager');
  const [overview, setOverview] = useState<IWorktreeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [removeWorktree, setRemoveWorktree] = useState(false);
  const [confirmedIgnored, setConfirmedIgnored] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/workspace/worktrees?workspaceId=${encodeURIComponent(workspace.id)}`, { signal: controller.signal });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!controller.signal.aborted) setOverview(data);
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [workspace.id, refresh]);

  const candidates = overview?.repositories.flatMap((repository) => repository.worktrees
    .filter((item) => !item.main && item.workspaces.some((linked) => linked.id === workspace.id))
    .map((item) => ({ repositoryId: repository.id, item }))) ?? [];
  const selection = candidates.length === 1 ? candidates[0] : null;
  const blocker = selection?.item.blockers.find((reason) => reason !== 'sessions');
  const ignoredPaths = selection?.item.status?.ignoredPaths ?? [];
  const unavailable = !!loadError || !!overview?.errors.length || candidates.length > 1
    || (!!workspace.worktree && !loading && !selection);
  const blocked = removeWorktree && (!selection || loading || unavailable || !!blocker
    || (ignoredPaths.length > 0 && !confirmedIgnored));

  const reload = () => {
    setOverview(null);
    setLoadError('');
    setError('');
    setLoading(true);
    setRemoveWorktree(false);
    setConfirmedIgnored(false);
    setRefresh((value) => value + 1);
  };

  const remove = async () => {
    if (busy || blocked) return;
    setBusy(true);
    setError('');
    const store = useWorkspaceStore.getState();
    const pendingIds = removeWorktree && selection
      ? selection.item.workspaces.map((linked) => linked.id) : [workspace.id];
    for (const id of pendingIds) store.markPendingDelete(id);
    try {
      if (removeWorktree && selection) {
        const { item, repositoryId } = selection;
        const result = await store.removeWorktree(workspace.id, {
          repositoryId, directory: item.directory, head: item.head, branch: item.branch,
          deleteBranch: false, closeIdleSessions: true, confirmedIgnoredPaths: ignoredPaths,
        });
        for (const warning of result.warnings) toast.warning(tm(warning));
        if (!result.removedWorkspaceIds.includes(workspace.id)) {
          setError(tm('workspaceCleanupFailed'));
          setOverview(null);
          return;
        }
        toast.success(tm('deleted'));
      } else if (onDeleteProject) {
        if (!await onDeleteProject()) { setError(tw('deleteFailed')); return; }
      } else {
        if (!await store.deleteWorkspace(workspace.id)) { setError(tw('deleteFailed')); return; }
        store.removeWorkspace(workspace.id);
      }
      onClose();
    } catch (error) {
      const failure = error as Error & { code?: string };
      setError(failure.code ? tm(`reasons.${failure.code}`) : failure.message);
    } finally {
      for (const id of pendingIds) store.unmarkPendingDelete(id);
      setBusy(false);
    }
  };

  return <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <AlertDialogContent className="max-h-[85dvh] overflow-y-auto">
      <AlertDialogHeader>
        <AlertDialogTitle>{t('deleteWorkspace')}</AlertDialogTitle>
        <AlertDialogDescription>{t('deleteWorkspaceConfirm', { name: workspace.name })}</AlertDialogDescription>
      </AlertDialogHeader>
      <p className="text-sm text-muted-foreground">{t('deleteWorkspaceDirectoryRetained')}</p>
      {loading && <p role="status" className="text-sm">{tm('loading')}</p>}
      {unavailable && <p role="alert" className="text-sm text-ui-red">{t('deleteWorkspaceWorktreeUnavailable')}</p>}
      {loadError && <p className="break-all text-xs text-ui-red">{loadError}</p>}
      {selection && <>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={removeWorktree} disabled={busy || unavailable}
            onChange={(event) => { setRemoveWorktree(event.target.checked); setConfirmedIgnored(false); }} />
          {t('deleteWorkspaceWorktree')}
        </label>
        {removeWorktree && <div className="flex flex-col gap-3 text-sm">
          <p className="break-all font-mono text-xs">{selection.item.directory}</p>
          <p className="break-all">{t('deleteWorkspaceBranchRetained', { branch: selection.item.branch ?? 'HEAD' })}</p>
          <p className="break-all">{t('deleteWorkspaceLinkedProjects', { names: selection.item.workspaces.map((linked) => linked.name).join(', ') })}</p>
          <p>{tm('closeIdleSessionsNotice')}</p>
          {blocker && <p role="alert" className="text-ui-red">{tm(`reasons.${blocker}`)}</p>}
          <WorktreeIgnoredNotice paths={ignoredPaths} />
          {ignoredPaths.length > 0 && <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={confirmedIgnored} disabled={busy}
              onChange={(event) => setConfirmedIgnored(event.target.checked)} />
            {t('deleteWorkspaceConfirmIgnored')}
          </label>}
        </div>}
      </>}
      {error && <p role="alert" className="break-all text-sm text-ui-red">{error}</p>}
      <AlertDialogFooter>
        <Button variant="outline" disabled={busy || loading} onClick={reload}>{tc('refresh')}</Button>
        <Button variant="outline" disabled={busy} onClick={onClose}>{tc('cancel')}</Button>
        <Button className="bg-ui-red hover:bg-ui-red/80" disabled={busy || blocked} onClick={remove}>
          {busy ? tm('working') : tc('delete')}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
