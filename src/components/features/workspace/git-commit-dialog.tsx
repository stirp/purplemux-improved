import { useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Loader2, WandSparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { copyToClipboard } from '@/lib/clipboard';
import type { ICommitPreview, ICommitResult, IGeneratedCommit } from '@/types/git-commit';

const requestCommit = async <T,>(session: string, action: string, payload: object = {}, signal?: AbortSignal): Promise<T> => {
  const response = await fetch('/api/git/commit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ session, action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error), { code: data.code });
  return data;
};

export default function GitCommitDialog({ sessionName, onClose, onCommitted }: {
  sessionName: string; onClose: () => void; onCommitted: () => void;
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
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const failureText = (error: unknown) => {
    const failure = error as Error & { code?: string };
    return failure.code ? `${t(`errors.${failure.code}`)}${failure.code === 'commitFailed' ? `\n${failure.message}` : ''}` : failure.message;
  };

  useEffect(() => {
    const controller = new AbortController();
    requestCommit<ICommitPreview>(sessionName, 'inspect', {}, controller.signal).then((data) => {
      if (!controller.signal.aborted) setPreview(data);
    }).catch((error) => {
      if (!controller.signal.aborted) setError(error);
    }).finally(() => { if (!controller.signal.aborted) setBusy(null); });
    return () => controller.abort();
  }, [sessionName]);

  const generate = async () => {
    if (pending.current || busy) return;
    pending.current = true;
    setBusy('generate'); setError(null); setNotice(''); setReplaceConfirm(false); setPreview(null);
    try {
      const data = await requestCommit<IGeneratedCommit>(sessionName, 'generate', { locale });
      if (mounted.current) { setPreview(data); setTitle(data.title); setBody(data.body); setTruncated(data.truncated); }
    } catch (error) { if (mounted.current) setError(error as Error); }
    finally { pending.current = false; if (mounted.current) setBusy(null); }
  };

  const commit = async () => {
    if (pending.current || busy || !preview || !title.trim() || result) return;
    pending.current = true;
    setBusy('commit'); setError(null); setNotice('');
    try {
      const data = await requestCommit<ICommitResult>(sessionName, 'commit', { snapshot: preview.snapshot, message: { title, body } });
      if (mounted.current) { setResult(data); onCommitted(); }
    } catch (error) {
      if (mounted.current) {
        setError(error as Error);
        if (['changed', 'noStagedChanges', 'operation', 'conflicts', 'detached'].includes((error as { code?: string }).code ?? '')) setPreview(null);
      }
    } finally { pending.current = false; if (mounted.current) setBusy(null); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{t('title')}</DialogTitle><DialogDescription>{t('description')}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="whitespace-pre-wrap break-all text-sm text-ui-red">{failureText(error)}</p>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {preview && <div className="min-w-0 rounded border p-3 text-sm">
        <p className="break-all font-mono text-xs">{preview.snapshot.directory}</p>
        <p className="mt-1 break-all">{t('branch')}: {preview.snapshot.branch.replace(/^refs\/heads\//, '')}</p>
        <details className="mt-2"><summary>{t('stagedFiles', { count: preview.files.length })}</summary>
          <ul className="mt-2 max-h-32 overflow-auto text-xs">{preview.files.map((file) => <li key={file} className="break-all font-mono">{file}</li>)}</ul>
        </details>
      </div>}
      {busy && <p role="status" className="flex items-center gap-2 text-sm"><Loader2 className="size-4 animate-spin" />{t(busy === 'inspect' ? 'loading' : busy === 'generate' ? 'generating' : 'committing')}</p>}
      {truncated && <p role="status" className="text-sm text-muted-foreground">{t('truncated')}</p>}
      {result ? <div role="status" className="rounded border p-3 text-sm">
        <p>{t('success', { hash: result.head.slice(0, 8) })}</p>
        {result.warning && <p role="alert" className="mt-2">{t(`errors.${result.warning}`)}</p>}
        {result.output && <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-all text-xs">{result.output}</pre>}
      </div> : <>
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
        </div>
      </>}
      <div className="flex justify-end"><Button variant="outline" disabled={!!busy} onClick={onClose}>{t('close')}</Button></div>
    </DialogContent>
  </Dialog>;
}
