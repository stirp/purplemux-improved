import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, WandSparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requestWorktreeAction } from '@/lib/worktree-action-client';
import type { IWorktreeDraftResult, IWorktreeSyncInfo, TWorktreeSnapshot } from '@/types/worktree';

export default function WorktreeDraftForm({ workspaceId, item, info, disabled, onBusy, onDone, message, autoPublish = false }: {
  workspaceId: string; item: TWorktreeSnapshot; info: IWorktreeSyncInfo; disabled: boolean;
  onBusy: (busy: boolean) => void; onDone: () => void;
  message?: { title: string; body: string }; autoPublish?: boolean;
}) {
  const t = useTranslations('workspace.worktreeManager');
  const locale = useLocale();
  const generation = useRef<AbortController | null>(null);
  const [generating, setGenerating] = useState(false);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  useEffect(() => () => generation.current?.abort(), []);
  const [remote, setRemote] = useState('');
  const [providerOverride, setProviderOverride] = useState<{ repository: string; provider: 'github' | 'gitlab' } | null>(null);
  const [target, setTarget] = useState('');
  const [title, setTitle] = useState(message?.title ?? '');
  const [body, setBody] = useState(message?.body ?? '');
  const [confirm, setConfirm] = useState<'pushBranch' | 'createDraft' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<IWorktreeDraftResult | null>(null);
  const pending = useRef(false);
  const autoStarted = useRef(false);
  const [stage, setStage] = useState<'generatingDraft' | 'pushingBranch' | 'creatingDraft' | null>(null);
  const [pushed, setPushed] = useState('');
  const selected = info.remotes.find((entry) => entry.name === remote) ?? info.remotes[0];
  const defaultProvider = selected && new URL(selected.repository).hostname !== 'github.com' ? 'gitlab' : 'github';
  const provider = providerOverride && providerOverride.repository === selected?.repository
    ? providerOverride.provider : defaultProvider;
  const blocked = info.blockers.some((reason) => !['main', 'ignored', 'sessions', 'sharedWorkspace'].includes(reason));
  const defaultTarget = info.targetRef === `refs/heads/${info.branch}` ? ''
    : info.targetRef?.replace(/^refs\/heads\//, '').replace(/^refs\/remotes\/[^/]+\//, '') ?? '';
  const targetBranch = target || defaultTarget;
  const publicationKey = JSON.stringify([workspaceId, item.repositoryId, item.directory, info.branch, info.head, selected]);
  const published = pushed === publicationKey;
  const canPublish = !!selected && !blocked && !!info.branch && !!targetBranch && targetBranch !== info.branch;
  const generateMessage = () => requestWorktreeAction<{ title: string; body: string }>(workspaceId, 'generateDraft', {
    item: { ...item, head: info.head, branch: info.branch }, remote: selected!.name, targetBranch, locale,
  }, generation.current?.signal);
  const generate = async () => {
    if (generation.current || disabled || busy || !selected || !targetBranch) return;
    const controller = new AbortController();
    generation.current = controller;
    setGenerating(true); onBusy(true); setError(''); setNotice(''); setReplaceConfirm(false);
    try {
      const data = await generateMessage();
      if (!controller.signal.aborted) { setTitle(data.title); setBody(data.body); }
    } catch (error) {
      const failure = error as Error & { code?: string };
      if (!controller.signal.aborted) setError(failure.code ? t(`reasons.${failure.code}`) : failure.message);
    } finally {
      if (!controller.signal.aborted) { setGenerating(false); onBusy(false); }
      generation.current = null;
    }
  };
  const perform = async (action: 'pushBranch' | 'createDraft' | 'publish') => {
    if (!selected || busy || disabled || generating || pending.current || blocked) return;
    if (action !== 'pushBranch' && !canPublish) return;
    pending.current = true;
    setBusy(true); onBusy(true); setError(''); setNotice('');
    try {
      let draft = { title: title.trim(), body };
      if (action === 'publish' && !draft.title) {
        setStage('generatingDraft');
        const generated = await generateMessage();
        draft = { title: generated.title, body: body.trim() ? body : generated.body };
        setTitle(draft.title); setBody(draft.body);
      }
      const payload = { item: { ...item, head: info.head, branch: info.branch }, remote: selected.name };
      if (action === 'pushBranch' || (action === 'publish' && !published)) {
        setStage('pushingBranch');
        await requestWorktreeAction(workspaceId, 'pushBranch', payload);
        setPushed(publicationKey); setNotice(t('branchPushed'));
      }
      if (action !== 'pushBranch') {
        setStage('creatingDraft');
        const data = await requestWorktreeAction<IWorktreeDraftResult>(workspaceId, 'createDraft', {
          ...payload, provider, targetBranch, ...draft,
        });
        setResult(data); setNotice(t(data.existing ? 'draftExisting' : 'draftCreated'));
        if (!data.warning) onDone();
      } else onDone();
    } catch (error) {
      const failure = error as Error & { code?: string };
      setError(failure.code ? t(`reasons.${failure.code}`) : failure.message);
    } finally { pending.current = false; setBusy(false); setStage(null); onBusy(false); setConfirm(null); }
  };
  const startAutoPublish = useEffectEvent(() => {
    if (canPublish) void perform('publish');
    else { setNotice(t('completePublishSettings')); onBusy(false); }
  });
  useEffect(() => {
    if (!autoPublish || disabled || autoStarted.current) return;
    autoStarted.current = true;
    startAutoPublish();
  }, [autoPublish, disabled]);
  return <div className="flex flex-col gap-3 border-t pt-4">
    <h3 className="font-medium">{t('createDraft')}</h3>
    <p className="text-xs text-muted-foreground">{t('draftHint')}</p>
    {error && <p role="alert" className="text-ui-red">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {stage && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{t(stage)}</p>}
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
        <Button disabled={disabled || busy || generating} onClick={() => { if (confirm) void perform(confirm); }}>{busy ? t('working') : t('confirmAction')}</Button>
      </div>
    </div> : <fieldset disabled={disabled || busy || generating} className="flex min-w-0 flex-col gap-3">
      <label className="flex flex-col gap-1">{t('publishRemote')}
        <select className="w-full rounded border bg-background p-2" value={selected?.name ?? ''} onChange={(event) => { setRemote(event.target.value); setProviderOverride(null); }}>
          {!info.remotes.length && <option value="">{t('noPublishRemote')}</option>}
          {info.remotes.map((entry) => <option key={entry.name} value={entry.name}>{entry.name} · {entry.repository}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">{t('reviewProvider')}
        <select className="rounded border bg-background p-2" value={provider} onChange={(event) => {
          if (selected) setProviderOverride({ repository: selected.repository, provider: event.target.value as 'github' | 'gitlab' });
        }}><option value="github">GitHub</option><option value="gitlab">GitLab</option></select>
      </label>
      <label className="flex flex-col gap-1">{t('draftTarget')}<Input value={targetBranch} maxLength={1024} onChange={(event) => setTarget(event.target.value)} /></label>
      <div className="flex flex-col gap-1">
        <label htmlFor="worktree-draft-title">{t('draftTitle')}</label>
        <div className="flex gap-2">
          <Input id="worktree-draft-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          <Button type="button" variant="outline" size="icon" className="shrink-0" aria-label={t('generateDraft')} title={t('generateDraft')}
            disabled={generating || !selected || !targetBranch || targetBranch === info.branch || !info.branch}
            onClick={() => { if (title.trim() || body.trim()) setReplaceConfirm(true); else void generate(); }}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : <WandSparkles className="size-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('generateDraftHint')}</p>
        {generating && <p role="status" className="text-xs text-muted-foreground">{t('generatingDraft')}</p>}
        {replaceConfirm && <div className="rounded border p-2 text-sm">
          <p>{t('replaceDraftConfirm')}</p>
          <div className="mt-2 flex gap-2">
            <Button type="button" variant="outline" onClick={() => setReplaceConfirm(false)}>{t('back')}</Button>
            <Button type="button" onClick={() => void generate()}>{t('confirmAction')}</Button>
          </div>
        </div>}
      </div>
      <label className="flex flex-col gap-1">{t('draftBody')}<textarea className="min-h-24 w-full rounded border bg-background p-2 text-sm" value={body} maxLength={20000} onChange={(event) => setBody(event.target.value)} /></label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!selected || blocked} onClick={() => setConfirm('pushBranch')}>{t('pushBranch')}</Button>
        <Button disabled={!selected || blocked || !targetBranch || targetBranch === info.branch || !title.trim()} onClick={() => setConfirm('createDraft')}>{t('createDraft')}</Button>
        {!result && <Button className="h-auto min-h-8 max-w-full whitespace-normal py-1" disabled={!canPublish} onClick={() => void perform('publish')}>
          {t(!title.trim() ? 'generateAndPublish' : published ? 'finishPublish' : 'pushAndCreateDraft')}
        </Button>}
      </div>
    </fieldset>}
  </div>;
}
