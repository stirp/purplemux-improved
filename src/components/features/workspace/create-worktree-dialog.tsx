import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspace } from '@/types/terminal';

interface ISource {
  branch: string; dirty: boolean; worktreeRoot: string;
  branches: { ref: string; name: string; remote: boolean }[];
}

export default function CreateWorktreeDialog({ workspace, onClose, onCreated }: {
  workspace: IWorkspace; onClose: () => void; onCreated: (id: string) => void;
}) {
  const t = useTranslations('workspace.worktree');
  const tc = useTranslations('common');
  const [directoryIndex, setDirectoryIndex] = useState(0);
  const [name, setName] = useState('');
  const [branch, setBranch] = useState('');
  const [baseRef, setBaseRef] = useState('HEAD');
  const [customRef, setCustomRef] = useState('');
  const selectedBaseRef = baseRef === 'custom' ? customRef.trim() : baseRef;
  const [source, setSource] = useState<ISource | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setSource(null);
    setBaseRef('HEAD');
    setCustomRef('');
    setError('');
    fetch(`/api/workspace/worktree?workspaceId=${encodeURIComponent(workspace.id)}&directoryIndex=${directoryIndex}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        if (!controller.signal.aborted) setSource(data);
      }).catch((err) => { if (!controller.signal.aborted) setError(String(err.message)); });
    return () => controller.abort();
  }, [workspace.id, directoryIndex]);

  const submit = async () => {
    if (busy.current || !source) return;
    busy.current = true;
    setSubmitting(true);
    setError('');
    try {
      const child = await useWorkspaceStore.getState().createWorktree(workspace.id, {
        directoryIndex, name: name.trim(), branch: branch.trim(), baseRef: selectedBaseRef,
      });
      onCreated(child.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { busy.current = false; setSubmitting(false); }
  };

  return <Dialog open onOpenChange={(open) => { if (!open && !busy.current) onClose(); }}>
    <DialogContent className="sm:max-w-lg">
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <DialogHeader><DialogTitle>{t('create')}</DialogTitle></DialogHeader>
        {workspace.directories.length > 1 && <label className="flex flex-col gap-1 text-sm">
          {t('source')}
          <select className="rounded border bg-background p-2" value={directoryIndex} disabled={submitting}
            onChange={(event) => setDirectoryIndex(Number(event.target.value))}>
            {workspace.directories.map((directory, index) => <option key={directory} value={index}>{directory}</option>)}
          </select>
        </label>}
        <label className="flex flex-col gap-1 text-sm">{t('name')}
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} disabled={submitting} autoFocus />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t('branch')}
          <Input value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="task/my-feature" required maxLength={80} disabled={submitting} />
        </label>
        <label className="flex flex-col gap-1 text-sm">{t('base')}{source && ` (${source.branch})`}
          <select className="rounded border bg-background p-2" value={baseRef}
            onChange={(event) => setBaseRef(event.target.value)} disabled={submitting || !source}>
            <option value="HEAD">HEAD{source && ` (${source.branch})`}</option>
            <optgroup label={t('localBranches')}>
              {source?.branches.filter((item) => !item.remote).map((item) =>
                <option key={item.ref} value={item.ref}>{item.name}</option>)}
            </optgroup>
            <optgroup label={t('remoteBranches')}>
              {source?.branches.filter((item) => item.remote).map((item) =>
                <option key={item.ref} value={item.ref}>{item.name}</option>)}
            </optgroup>
            <option value="custom">{t('customRef')}</option>
          </select>
        </label>
        {baseRef === 'custom' && <label className="flex flex-col gap-1 text-sm">{t('customRef')}
          <Input value={customRef} onChange={(event) => setCustomRef(event.target.value)} required maxLength={200} disabled={submitting} placeholder="HEAD~1" />
        </label>}
        <p className="text-xs text-muted-foreground">{t('notice')}</p>
        {source?.dirty && <p className="text-xs text-muted-foreground">{t('dirty')}</p>}
        {source ? branch.trim() && <p className="break-all text-xs text-muted-foreground">{t('path')}: {source.worktreeRoot}/{branch.trim().replace(/[/\\]/g, '-')}</p>
          : !error && <p className="text-sm text-muted-foreground">{t('loading')}</p>}
        {error && <p role="alert" className="break-all text-sm text-ui-red">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" disabled={submitting || !source || !name.trim() || !branch.trim() || !selectedBaseRef}>{t('create')}{submitting && '…'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
