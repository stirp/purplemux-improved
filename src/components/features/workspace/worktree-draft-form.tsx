import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestWorktreeAction } from '@/lib/worktree-action-client';
import type { IWorktreeDraftResult, IWorktreeSyncInfo, TWorktreeSnapshot } from '@/types/worktree';

export default function WorktreeDraftForm({ workspaceId, item, info, disabled, onBusy, onDone }: {
  workspaceId: string; item: TWorktreeSnapshot; info: IWorktreeSyncInfo; disabled: boolean;
  onBusy: (busy: boolean) => void; onDone: () => void;
}) {
  const t = useTranslations('workspace.worktreeManager');
  const [remote, setRemote] = useState('');
  const [provider, setProvider] = useState<'github' | 'gitlab'>('github');
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirm, setConfirm] = useState<'pushBranch' | 'createDraft' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<IWorktreeDraftResult | null>(null);
  const selected = info.remotes.find((entry) => entry.name === remote) ?? info.remotes[0];
  const blocked = info.blockers.some((reason) => !['ignored', 'sessions', 'sharedWorkspace'].includes(reason));
  const targetBranch = target || (info.targetRef?.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\/[^/]+\//, '') ?? '');
  const perform = async () => {
    if (!confirm || !selected || busy || disabled) return;
    setBusy(true); onBusy(true); setError(''); setNotice('');
    try {
      const data = await requestWorktreeAction<IWorktreeDraftResult>(workspaceId, confirm, {
        item: { ...item, head: info.head, branch: info.branch }, remote: selected.name,
        ...(confirm === 'createDraft' ? { provider, targetBranch, title: title.trim(), body } : {}),
      });
      if (confirm === 'createDraft') { setResult(data); setNotice(t(data.existing ? 'draftExisting' : 'draftCreated')); }
      else setNotice(t('branchPushed'));
      if (confirm !== 'createDraft' || !data.warning) onDone();
    } catch (error) {
      const failure = error as Error & { code?: string };
      setError(failure.code ? t(`reasons.${failure.code}`) : failure.message);
    } finally { setBusy(false); onBusy(false); setConfirm(null); }
  };
  return <div className="flex flex-col gap-3 border-t pt-4">
    <h3 className="font-medium">{t('createDraft')}</h3>
    <p className="text-xs text-muted-foreground">{t('draftHint')}</p>
    {error && <p role="alert" className="text-ui-red">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {result && <div className="rounded border p-3 text-sm">
      <a href={result.review.url} target="_blank" rel="noopener noreferrer" className="break-all underline">{result.review.url}</a>
      {result.warning && <p role="alert">{t(`reasons.${result.warning}`)}</p>}
    </div>}
    {confirm ? <div className="flex flex-col gap-3 rounded border p-3">
      <p>{t(confirm === 'pushBranch' ? 'pushConfirm' : 'draftConfirm')}</p>
      <p className="break-all text-sm">{selected?.name}: {selected?.repository}</p>
      <p className="break-all font-mono text-xs">{info.branch} · {info.head}</p>
      {confirm === 'createDraft' && <><p>{provider === 'github' ? 'GitHub' : 'GitLab'} · {info.branch} → {targetBranch}</p><p className="break-all">{title}</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all text-xs">{body}</pre></>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>{t('back')}</Button>
        <Button disabled={disabled || busy} onClick={() => void perform()}>{busy ? t('working') : t('confirmAction')}</Button>
      </div>
    </div> : <fieldset disabled={disabled || busy} className="flex min-w-0 flex-col gap-3">
      <label className="flex flex-col gap-1">{t('publishRemote')}
        <select className="w-full rounded border bg-background p-2" value={selected?.name ?? ''} onChange={(event) => setRemote(event.target.value)}>
          {!info.remotes.length && <option value="">{t('noPublishRemote')}</option>}
          {info.remotes.map((entry) => <option key={entry.name} value={entry.name}>{entry.name} · {entry.repository}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">{t('reviewProvider')}
        <select className="rounded border bg-background p-2" value={provider} onChange={(event) => setProvider(event.target.value as 'github' | 'gitlab')}><option value="github">GitHub</option><option value="gitlab">GitLab</option></select>
      </label>
      <label className="flex flex-col gap-1">{t('draftTarget')}<Input value={targetBranch} maxLength={1024} onChange={(event) => setTarget(event.target.value)} /></label>
      <label className="flex flex-col gap-1">{t('draftTitle')}<Input value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} /></label>
      <label className="flex flex-col gap-1">{t('draftBody')}<textarea className="min-h-24 w-full rounded border bg-background p-2 text-sm" value={body} maxLength={20000} onChange={(event) => setBody(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!selected || blocked} onClick={() => setConfirm('pushBranch')}>{t('pushBranch')}</Button>
        <Button disabled={!selected || blocked || !targetBranch || targetBranch === info.branch || !title.trim()} onClick={() => setConfirm('createDraft')}>{t('createDraft')}</Button>
      </div>
    </fieldset>}
  </div>;
}
