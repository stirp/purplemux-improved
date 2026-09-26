import WorktreeDraftForm from '@/components/features/workspace/worktree-draft-form';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestWorktreeAction } from '@/lib/worktree-action-client';
import type { IWorktreeSyncInfo, IWorktreeSyncResult, TWorktreeSnapshot } from '@/types/worktree';

export default function WorktreeDeliveryDialog({ workspaceId, item, onClose }: {
  workspaceId: string; item: TWorktreeSnapshot; onClose: () => void;
}) {
  const t = useTranslations('workspace.worktreeManager');
  const [info, setInfo] = useState<IWorktreeSyncInfo | null>(null);
  const [targetRef, setTargetRef] = useState('');
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState('');
  const [output, setOutput] = useState('');
  const [confirm, setConfirm] = useState<'merge' | 'rebase' | 'abort' | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    requestWorktreeAction<IWorktreeSyncInfo>(workspaceId, 'inspectSync', { item, ...(targetRef ? { targetRef } : {}) }, controller.signal)
      .then((data) => { if (!controller.signal.aborted) { setInfo(data); setLoadError(''); } })
      .catch((error) => { if (!controller.signal.aborted) { setInfo(null); setLoadError(error.code ? t(`reasons.${error.code}`) : error.message); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, item, targetRef, refresh, t]);

  const reload = () => { setLoading(true); setRefresh((value) => value + 1); };
  const perform = async (action: string) => {
    if (!info || busy || loading) return;
    setBusy(true);
    setError('');
    setNotice('');
    setOutput('');
    const current = { ...item, head: info.head, branch: info.branch };
    try {
      const payload = action === 'saveReview' ? { url: (reviewUrl ?? info.review?.url ?? '').trim() || null }
        : action === 'merge' || action === 'rebase' ? { targetRef: info.targetRef, targetHead: info.targetHead } : {};
      const result = await requestWorktreeAction<IWorktreeSyncResult | null>(workspaceId, action, { item: current, ...payload });
      if (['merge', 'rebase', 'continue', 'abort'].includes(action)) {
        setNotice(t(result?.ok ? 'syncDone' : 'syncNeedsAttention'));
        setOutput(result?.output ?? '');
      } else setNotice(t(action === 'fetch' ? 'fetched' : 'reviewUpdated'));
      if (action === 'saveReview') setReviewUrl(null);
    } catch (error) {
      const failure = error as Error & { code?: string };
      setError(failure.code ? t(`reasons.${failure.code}`) : failure.message);
    } finally { setBusy(false); setConfirm(null); reload(); }
  };

  const recovering = info?.blockers.filter((reason) => !['dirty', 'operation'].includes(reason) && !(reason === 'detached' && info.operation === 'rebase')) ?? [];
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{t('deliveryTitle')}</DialogTitle><DialogDescription>{t('syncDescription')}</DialogDescription></DialogHeader>
      <p className="break-all font-mono text-xs">{item.directory}</p>
      {error && <p role="alert" className="break-all text-ui-red">{error}</p>}
      {loadError && <p role="alert" className="break-all text-ui-red">{loadError}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p role="status">{t('loading')}</p>}
      {info && <>
        <p>{t('currentBranch')}: <strong className="break-all">{info.branch ?? t('detached')}</strong></p>
        {confirm ? <div className="flex flex-col gap-3 rounded border p-3">
          <p>{confirm === 'abort' ? t('abortNotice') : t('syncConfirm', { action: confirm, branch: info.branch ?? 'HEAD', target: info.targetRef ?? '' })}</p>
          {confirm === 'rebase' && <p className="text-sm text-muted-foreground">{t('rebaseNotice')}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>{t('back')}</Button>
            <Button disabled={busy || loading} onClick={() => void perform(confirm)}>{busy ? t('working') : t('confirmAction')}</Button>
          </div>
        </div> : <>
          <label className="flex flex-col gap-2">{t('syncTarget')}
            <select className="w-full rounded border bg-background p-2" value={targetRef || info.targetRef || ''} disabled={busy || loading || !!info.operation}
              onChange={(event) => { setLoading(true); setTargetRef(event.target.value); setError(''); }}>
              <option value="" disabled>{t('chooseTarget')}</option>
              {info.branches.map((branch) => <option key={branch.ref} value={branch.ref}>{branch.ref}</option>)}
            </select>
          </label>
          {info.targetHead && <div className="text-sm">
            <p>{t('targetCounts', { ahead: info.ahead ?? '?', behind: info.behind ?? '?' })}</p>
            {info.ahead === 0 && <p className="text-muted-foreground">{t('integrated')}</p>}
          </div>}
          {info.operation ? <div className="rounded border p-3">
            <p>{t('operationPending', { operation: info.operation })}</p>
            <p className="my-2 text-xs text-muted-foreground">{t('resolveNotice')}</p>
            <div className="flex gap-2">
              <Button disabled={busy || loading || recovering.length > 0} onClick={() => void perform('continue')}>{t('continueOperation')}</Button>
              <Button variant="outline" disabled={busy || loading || recovering.length > 0} onClick={() => setConfirm('abort')}>{t('abortOperation')}</Button>
            </div>
          </div> : <div className="flex flex-wrap gap-2">
            <Button disabled={busy || loading || !info.targetHead || info.blockers.length > 0} onClick={() => setConfirm('merge')}>{t('mergeTarget')}</Button>
            <Button variant="outline" disabled={busy || loading || !info.targetHead || info.blockers.length > 0} onClick={() => setConfirm('rebase')}>{t('rebaseTarget')}</Button>
          </div>}
          {(info.operation ? recovering : info.blockers).length > 0 && <p className="text-xs text-muted-foreground">{(info.operation ? recovering : info.blockers).map((reason) => t(`reasons.${reason}`)).join(' · ')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || loading} onClick={() => void perform('fetch')}>{t('fetchRemotes')}</Button>
            <Button variant="outline" disabled={busy || loading} onClick={reload}>{t('refresh')}</Button>
          </div>
          <div className="flex flex-col gap-3 border-t pt-4">
            <label className="flex flex-col gap-2">{t('reviewLink')}
              <Input value={reviewUrl ?? info.review?.url ?? ''} disabled={busy || loading} placeholder="https://github.com/owner/repo/pull/123" onChange={(event) => setReviewUrl(event.target.value)} />
            </label>
            <p className="text-xs text-muted-foreground">{t('reviewHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={busy || loading} onClick={() => void perform('saveReview')}>{t('saveReview')}</Button>
              <Button variant="outline" disabled={busy || loading || !info.review} onClick={() => void perform('refreshReview')}>{t('refreshReview')}</Button>
            </div>
            {info.review && <div className="rounded border p-3 text-sm">
              <a href={info.review.url} target="_blank" rel="noopener noreferrer" className="break-all underline">{info.review.title || info.review.url}</a>
              <p>{t(`reviewStates.${info.review.error ? 'unknown' : info.review.state}`)}</p>
              {info.review.sourceBranch && <p className="break-all">{info.review.sourceBranch} → {info.review.targetBranch}</p>}
              {info.review.checkedAt && <p className="text-xs text-muted-foreground">{t('checkedAt', { time: new Date(info.review.checkedAt).toLocaleString() })}</p>}
              {info.review.error && <p role="alert" className="text-ui-red">{t(`reasons.${info.review.error}`)}</p>}
              {info.review.head && info.review.head !== info.head && <p className="text-xs text-muted-foreground">{t('reviewHeadDiffers')}</p>}
            </div>}
          </div>
          <WorktreeDraftForm workspaceId={workspaceId} item={item} info={info} disabled={busy || loading} onBusy={setBusy} onDone={reload} />
        </>}
      </>}
      {output && <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">{output}</pre>}
      <div className="flex justify-end"><Button variant="outline" disabled={busy} onClick={onClose}>{t('back')}</Button></div>
    </DialogContent>
  </Dialog>;
}
