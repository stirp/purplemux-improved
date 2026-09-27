import { useEffect, useRef, useState } from 'react';
import { WandSparkles, Loader2, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
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
  const [baseOpen, setBaseOpen] = useState(false);
  const [customRef, setCustomRef] = useState('');
  const selectedBaseRef = baseRef === 'custom' ? customRef.trim() : baseRef;
  const [source, setSource] = useState<ISource | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const [generating, setGenerating] = useState(false);
  const generation = useRef<AbortController | null>(null);
  useEffect(() => () => generation.current?.abort(), []);

  const generateBranch = async () => {
    if (generation.current || busy.current || !source || !name.trim()) return;
    const controller = new AbortController();
    generation.current = controller;
    setGenerating(true);
    setError('');
    try {
      const response = await fetch('/api/workspace/generate-branch-name', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id, directoryIndex, title: name.trim(), baseRef: selectedBaseRef }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.code === 'codexTextOnlyUnavailable' ? t('codexTextOnlyUnavailable') : data.error || t('generationFailed'));
      if (!controller.signal.aborted) setBranch(data.branch);
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : t('generationFailed'));
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
      generation.current = null;
    }
  };
  useEffect(() => {
    const controller = new AbortController();
    setSource(null);
    setBaseRef('HEAD');
    setBaseOpen(false);
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
    if (busy.current || generation.current || !source) return;
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
          <select className="rounded border bg-background p-2" value={directoryIndex} disabled={generating || submitting}
            onChange={(event) => setDirectoryIndex(Number(event.target.value))}>
            {workspace.directories.map((directory, index) => <option key={directory} value={index}>{directory}</option>)}
          </select>
        </label>}
        <label className="flex flex-col gap-1 text-sm">{t('name')}
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} disabled={generating || submitting} autoFocus />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor="worktree-branch">{t('branch')}</label>
          <div className="flex gap-2">
            <Input id="worktree-branch" value={branch} onChange={(event) => setBranch(event.target.value)} placeholder="task/my-feature" required maxLength={80} disabled={generating || submitting} />
            <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => void generateBranch()}
              disabled={generating || submitting || !source || !name.trim() || !selectedBaseRef}
              aria-label={t(generating ? 'generatingBranch' : 'generateBranch')} title={t('generateBranch')}>
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
            </Button>
          </div>
          {generating && <p role="status" className="text-xs text-muted-foreground">{t('generatingBranch')}</p>}
        </div>
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <label htmlFor="worktree-base">{t('base')}{source && ` (${source.branch})`}</label>
          <Popover open={baseOpen} onOpenChange={setBaseOpen}>
            <PopoverTrigger render={<Button id="worktree-base" type="button" variant="outline"
              className="w-full justify-between font-normal" disabled={generating || submitting || !source} />}>
              <span className="truncate">{baseRef === 'HEAD' ? `HEAD${source ? ` (${source.branch})` : ''}`
                : baseRef === 'custom' ? t('customRef') : source?.branches.find((item) => item.ref === baseRef)?.name ?? baseRef}</span>
              <ChevronDown className="size-4 shrink-0" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[var(--anchor-width)] p-0"
              onKeyDown={(event) => { if (event.key === 'Enter') event.preventDefault(); }}>
              <Command filter={(value, search, keywords) =>
                [value, ...(keywords ?? [])].some((text) => text.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0}>
                <CommandInput placeholder={tc('search')} aria-label={tc('search')} />
                <CommandList>
                  <CommandEmpty>{tc('noResults')}</CommandEmpty>
                  <CommandItem value="HEAD" keywords={[source?.branch ?? '']} data-checked={baseRef === 'HEAD'}
                    onSelect={() => { setBaseRef('HEAD'); setBaseOpen(false); }}>
                    HEAD{source && ` (${source.branch})`}
                  </CommandItem>
                  {[false, true].map((remote) => <CommandGroup key={String(remote)} heading={t(remote ? 'remoteBranches' : 'localBranches')}>
                    {source?.branches.filter((item) => item.remote === remote).map((item) =>
                      <CommandItem key={item.ref} value={item.ref} keywords={[item.name]} data-checked={baseRef === item.ref}
                        onSelect={() => { setBaseRef(item.ref); setBaseOpen(false); }}>
                        <span className="truncate" title={item.name}>{item.name}</span>
                      </CommandItem>)}
                  </CommandGroup>)}
                  <CommandItem value="custom" keywords={[t('customRef')]} data-checked={baseRef === 'custom'}
                    onSelect={() => { setBaseRef('custom'); setBaseOpen(false); }}>
                    {t('customRef')}
                  </CommandItem>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        {baseRef === 'custom' && <label className="flex flex-col gap-1 text-sm">{t('customRef')}
          <Input value={customRef} onChange={(event) => setCustomRef(event.target.value)} required maxLength={200} disabled={generating || submitting} placeholder="HEAD~1" />
        </label>}
        <p className="text-xs text-muted-foreground">{t('notice')}</p>
        {source?.dirty && <p className="text-xs text-muted-foreground">{t('dirty')}</p>}
        {source ? branch.trim() && <p className="break-all text-xs text-muted-foreground">{t('path')}: {source.worktreeRoot}/{branch.trim().replace(/[/\\]/g, '-')}</p>
          : !error && <p className="text-sm text-muted-foreground">{t('loading')}</p>}
        {error && <p role="alert" className="break-all text-sm text-ui-red">{error}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={generating || submitting} onClick={onClose}>{tc('cancel')}</Button>
          <Button type="submit" disabled={generating || submitting || !source || !name.trim() || !branch.trim() || !selectedBaseRef}>{t('create')}{submitting && '…'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
