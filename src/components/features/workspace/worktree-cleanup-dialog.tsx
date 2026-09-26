import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { requestWorktreeAction } from '@/lib/worktree-action-client';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import WorktreeIgnoredNotice from '@/components/features/workspace/worktree-ignored-notice';
import type { ICleanupCandidate, ICleanupResult, TWorktreeSnapshot } from '@/types/worktree';

export default function WorktreeCleanupDialog({ workspaceId, items, onClose }: {
  workspaceId: string; items: TWorktreeSnapshot[]; onClose: () => void;
}) {
  const t = useTranslations('workspace.worktreeManager');
  const [preview, setPreview] = useState<ICleanupCandidate[] | null>(null);
  const [result, setResult] = useState<ICleanupResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    requestWorktreeAction<ICleanupCandidate[]>(workspaceId, 'previewCleanup', { items }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) setPreview(data); })
      .catch((error) => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, [workspaceId, items]);
  const eligible = preview?.filter((item) => !item.blockers.length) ?? [];
  const execute = async () => {
    if (busy || !eligible.length) return;
    setBusy(true);
    setError('');
    try { setResult(await useWorkspaceStore.getState().cleanupWorktrees(workspaceId, eligible.map((item) => ({ ...item, confirmedIgnoredPaths: item.ignoredPaths })))); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{t('batchTitle')}</DialogTitle><DialogDescription>{t('batchNotice')}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="break-all text-ui-red">{error}</p>}
      {!preview && !error && <p role="status">{t('loading')}</p>}
      {result ? <>
        <p role="status">{t('batchResult', { success: result.results.filter((item) => item.ok).length, failed: result.results.filter((item) => !item.ok).length })}</p>
        {result.results.map((item) => <div key={item.directory} className="rounded border p-3">
          <p className="break-all font-mono text-xs">{item.directory}</p>
          <p className={item.ok ? 'text-muted-foreground' : 'text-ui-red'}>{item.ok ? t('deleted') : item.code ? t(`reasons.${item.code}`) : item.error}</p>
          {item.warnings?.map((warning) => <p key={warning}>{t(warning)}</p>)}
        </div>)}
      </> : <>
        {preview && <p>{t('batchEligible', { eligible: eligible.length, total: preview.length })}</p>}
        {preview?.map((item) => <div key={item.directory} className="rounded border p-3">
          <p className="break-all font-mono text-xs">{item.directory}</p>
          <p className="text-sm">{item.branch}</p>
          <WorktreeIgnoredNotice paths={item.ignoredPaths} />
          <p className="text-xs text-muted-foreground">{item.blockers.length ? item.blockers.map((reason) => t(`reasons.${reason}`)).join(' · ') : t('eligible')}</p>
          {item.workspaces.length > 0 && <p className="text-xs">{t('associatedWorkspaces')}: {item.workspaces.map((item) => item.name).join(', ')}</p>}
        </div>)}
      </>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={onClose}>{t('back')}</Button>
        {!result && <Button variant="destructive" disabled={busy || !eligible.length} onClick={() => void execute()}>{busy ? t('working') : t('batchDelete', { count: eligible.length })}</Button>}
      </div>
    </DialogContent>
  </Dialog>;
}
