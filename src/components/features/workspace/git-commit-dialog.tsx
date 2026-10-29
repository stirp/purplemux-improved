import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, WandSparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyToClipboard } from '@/lib/clipboard';
import { requestCommit } from '@/lib/git-commit-request';
import type { ICommitPreview, ICommitRepository, ICommitResult, IGeneratedCommit } from '@/types/git-commit';
import GitCommitDelivery from '@/components/features/workspace/git-commit-delivery';

export default function GitCommitDialog({ sessionName, repository, onClose, onCommitted }: {
  sessionName: string; repository?: ICommitRepository; onClose: () => void; onCommitted: () => void;
}) {
  const t = useTranslations('diff.commit');
  const locale = useLocale();
  const [preview, setPreview] = useState<ICommitPreview | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<'inspect' | 'generate' | 'commit' | null>('inspect');
  const pending = useRef(false);
  const [replaceConfirm, setReplaceConfirm] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<(Error & { code?: string }) | null>(null);
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<ICommitResult | null>(null);
  const [deliveryBusy, setDeliveryBusy] = useState(false);
  const [publishAfterCommit, setPublishAfterCommit] = useState(false);
  const [committedMessage, setCommittedMessage] = useState<{ title: string; body: string }>();
  const continueAfterGeneration = useRef(false);
  const [continuationQueued, setContinuationQueued] = useState(false);
  const [noChanges, setNoChanges] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const failureText = (error: unknown) => {
    const failure = error as Error & { code?: string };
    return failure.code && t.has(`errors.${failure.code}`) ? `${t(`errors.${failure.code}`)}${failure.code === 'commitFailed' ? `\n${failure.message}` : ''}` : failure.message;
  };

  useEffect(() => {
    const controller = new AbortController();
    requestCommit<ICommitPreview>(sessionName, 'inspect', {}, controller.signal).then((data) => {
      if (!controller.signal.aborted) setPreview(data);
    }).catch((error) => {
      if (!controller.signal.aborted) {
        if (error.code === 'noChanges' && repository) setNoChanges(true);
        else setError(error);
      }
    }).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => controller.abort();
  }, [sessionName, repository]);

  const saveCommit = async (data: ICommitPreview, message: { title: string; body: string }, publish: boolean) => {
    setBusy('commit');
    try {
      const committed = await requestCommit<ICommitResult>(sessionName, 'commit', { snapshot: data.snapshot, message });
      if (mounted.current) {
        setCommittedMessage(message); setPublishAfterCommit(publish); setDeliveryBusy(publish);
        setResult(committed); onCommitted();
      }
    } catch (error) {
      if (mounted.current && ['changed', 'noChanges', 'operation', 'conflicts', 'detached', 'commitUnknown'].includes((error as { code?: string }).code ?? '')) setPreview(null);
      throw error;
    }
  };

  const generate = async (publish = false) => {
    if (pending.current || busy) return;
    pending.current = true;
    setBusy('generate'); setError(null); setNotice(''); setReplaceConfirm(false);
    continueAfterGeneration.current = publish;
    setContinuationQueued(publish);
    try {
      const data = await requestCommit<IGeneratedCommit>(sessionName, 'generate', { locale });
      if (mounted.current) {
        const message = { title: data.title.trim(), body: (publish && body.trim() ? body : data.body).trim() };
        setPreview(data); setTitle(message.title); setBody(message.body); setTruncated(data.truncated);
        if (continueAfterGeneration.current) await saveCommit(data, message, true);
      }
    } catch (error) { if (mounted.current) setError(error as Error); }
    finally {
      pending.current = false; continueAfterGeneration.current = false;
      if (mounted.current) { setBusy(null); setContinuationQueued(false); }
    }
  };

  const commit = async (publish = false) => {
    if (pending.current || busy || !preview || !title.trim() || result) return;
    pending.current = true;
    setBusy('commit'); setError(null); setNotice('');
    try {
      await saveCommit(preview, { title: title.trim(), body: body.trim() }, publish);
    } catch (error) {
      if (mounted.current) setError(error as Error);
    } finally { pending.current = false; if (mounted.current) setBusy(null); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !busy && !deliveryBusy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" showCloseButton={!busy && !deliveryBusy}>
      <DialogHeader><DialogTitle>{t('workflowTitle')}</DialogTitle><DialogDescription>{t('workflowDescription')}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="whitespace-pre-wrap break-all text-sm text-ui-red">{failureText(error)}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {preview && <div className="min-w-0 rounded border p-3 text-sm">
        <p className="break-all font-mono text-xs">{preview.snapshot.directory}</p>
        <p className="mt-1 break-all">{t('branch')}: {preview.snapshot.branch.replace(/^refs\/heads\//, '')}</p>
        <details className="mt-2"><summary>{t('changedFiles', { count: preview.files.length })}</summary>
          <ul className="mt-2 max-h-32 overflow-auto text-xs">{preview.files.map((file) => <li key={file} className="break-all font-mono">{file}</li>)}</ul>
        </details>
      </div>}
      {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{t(busy === 'inspect' ? 'loading' : busy === 'generate' ? 'generating' : 'committing')}</p>}
      {truncated && <p role="status" className="text-sm text-muted-foreground">{t('truncated')}</p>}
      {result ? <div role="status" className="rounded border p-3 text-sm">
        <p>{t('success', { hash: result.head.slice(0, 8) })}</p>
        {result.warning && <p role="alert" className="mt-2">{t(`errors.${result.warning}`)}</p>}
        {result.output && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-xs">{result.output}</pre>}
      </div> : noChanges ? <p role="status" className="text-sm">{t('cleanPublish')}</p> : <>
        <label className="flex flex-col gap-1 text-sm">{t('subject')}<Input value={title} maxLength={200} disabled={!!busy} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm">{t('body')}<textarea className="min-h-32 rounded border bg-background p-2" value={body} maxLength={20000} disabled={!!busy} onChange={(event) => setBody(event.target.value)} /></label>
        {replaceConfirm && <div className="rounded border p-3 text-sm">
          <p>{t('replaceConfirm')}</p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" disabled={!!busy} onClick={() => setReplaceConfirm(false)}>{t('cancel')}</Button>
            <Button disabled={!!busy} onClick={() => void generate()}>{t('generate')}</Button>
          </div>
        </div>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!!busy} onClick={() => { if (title.trim() || body.trim()) setReplaceConfirm(true); else void generate(); }}>
            <WandSparkles className="size-4" />{t('generate')}
          </Button>
          <Button variant="outline" disabled={!!busy || !title.trim()} onClick={async () => setNotice(t(await copyToClipboard(`${title.trim()}${body.trim() ? `\n\n${body.trim()}` : ''}`) ? 'copied' : 'copyFailed'))}>{t('copy')}</Button>
          <Button disabled={!!busy || !preview || !title.trim()} onClick={() => void commit()}>{t('adoptAndCommit')}</Button>
          <Button className="h-auto min-h-8 max-w-full whitespace-normal py-1" disabled={deliveryBusy || continuationQueued || (busy !== null && busy !== 'generate') || (!preview && busy !== 'generate')}
            onClick={() => {
              if (busy === 'generate') { continueAfterGeneration.current = true; setContinuationQueued(true); }
              else if (title.trim()) void commit(true);
              else void generate(true);
            }}>{t(continuationQueued ? 'publishQueued' : busy === 'generate' ? 'publishAfterGeneration' : title.trim() ? 'commitAndPublish' : 'generateCommitAndPublish')}</Button>
        </div>
      </>}
      {result && preview && <GitCommitDelivery sessionName={sessionName} directory={preview.snapshot.directory}
        branch={preview.snapshot.branch.replace(/^refs\/heads\//, '')} head={result.head} onBusy={setDeliveryBusy}
        message={committedMessage} autoPublish={publishAfterCommit} />}
      {noChanges && repository && <GitCommitDelivery sessionName={sessionName} directory={repository.directory}
        branch={repository.branch} head={repository.head} onBusy={setDeliveryBusy} />}
      <div className="flex justify-end"><Button variant="outline" disabled={!!busy || deliveryBusy} onClick={onClose}>{t('close')}</Button></div>
    </DialogContent>
  </Dialog>;
}
