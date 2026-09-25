import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp, Folder, ChevronRight } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface IDirectory { name: string; path: string; hidden: boolean }
interface IListing { directory: string; parent: string; directories: IDirectory[] }
interface IProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (directory: string) => Promise<boolean>;
  initialDirectory?: string;
}

const CreateWorkspaceDialog = ({ open, onOpenChange, onSubmit, initialDirectory = '' }: IProps) => {
  const t = useTranslations('workspace');
  const tc = useTranslations('common');
  const label = (key: string, fallback: string) => t.has(key) ? t(key) : fallback;
  const [requested, setRequested] = useState(initialDirectory);
  const [pathInput, setPathInput] = useState(initialDirectory);
  const [listing, setListing] = useState<IListing | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetch('/api/workspace/directories?directory=' + encodeURIComponent(requested), { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Directory unavailable');
        const data: IListing = await res.json();
        if (controller.signal.aborted) return;
        setListing(data);
        setPathInput(data.directory);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requested]);

  const navigate = (directory: string) => {
    setSelected([]);
    setFailedCount(0);
    setRequested(directory);
  };
  const visible = listing?.directories.filter((entry) => showHidden || !entry.hidden) ?? [];
  const submit = async (directories: string[]) => {
    if (busy.current || directories.length === 0) return;
    busy.current = true;
    setSubmitting(true);
    const failed: string[] = [];
    try {
      for (const directory of directories) {
        try { if (!await onSubmit(directory)) failed.push(directory); }
        catch { failed.push(directory); }
      }
      setSelected(failed);
      setFailedCount(failed.length);
      if (!failed.length) onOpenChange(false);
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!busy.current) onOpenChange(value); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{t('add')}</DialogTitle></DialogHeader>
        <div className="flex flex-col gap-3">
          <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); navigate(pathInput.trim()); }}>
            <Button type="button" variant="outline" disabled={submitting || loading || !listing || listing.parent === listing.directory}
              aria-label={label('parentDirectory', 'Parent directory')} onClick={() => listing && navigate(listing.parent)}>
              <ArrowUp size={16} />
            </Button>
            <Input aria-label={t('projectDirectory')} value={pathInput} disabled={submitting}
              onChange={(event) => setPathInput(event.target.value)} />
            <Button type="submit" variant="outline" disabled={submitting || loading}>{label('openDirectory', 'Open')}</Button>
          </form>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showHidden} disabled={submitting} onChange={(event) => {
              setShowHidden(event.target.checked);
              if (!event.target.checked) setSelected((prev) => prev.filter((value) =>
                !listing?.directories.some((entry) => entry.path === value && entry.hidden)));
            }} />
            {label('showHiddenDirectories', 'Show hidden directories')}
          </label>
          <div className="h-72 overflow-auto rounded border border-border" aria-busy={loading}>
            {loading ? <div className="flex justify-center p-8"><Spinner /></div> : error ? (
              <p role="alert" className="p-4 text-sm text-negative">{label('directoryReadFailed', 'Cannot read this directory. Check the path and permissions.')}</p>
            ) : visible.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">{label('noSubdirectories', 'No subdirectories')}</p>
            ) : visible.map((entry) => (
              <div key={entry.path} className="flex items-center gap-3 border-b border-border/40 px-3 hover:bg-muted/50">
                <input type="checkbox" checked={selected.includes(entry.path)} disabled={submitting} aria-label={entry.name}
                  onChange={() => setSelected((prev) => prev.includes(entry.path) ? prev.filter((value) => value !== entry.path) : [...prev, entry.path])} />
                <button type="button" disabled={submitting} onClick={() => navigate(entry.path)}
                  className="flex min-w-0 flex-1 items-center gap-2 py-3 text-left text-sm">
                  <Folder size={16} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 break-all">{entry.name}</span><ChevronRight size={14} className="shrink-0" />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{label('directorySelectionHint', 'Open folders to browse. Select folders to create one workspace per folder.')}</p>
          {selected.length > 0 && <p className="text-sm">{label('selectedDirectories', 'Selected folders')}: {selected.length}</p>}
          {failedCount > 0 && <p role="alert" className="text-sm text-negative">{t('createFailed')} ({failedCount})</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>{tc('cancel')}</Button>
          <Button variant="outline" disabled={submitting || loading || error || !listing}
            onClick={() => listing && submit([listing.directory])}>{label('useCurrentDirectory', 'Use current directory')}</Button>
          <Button disabled={submitting || loading || error || selected.length === 0} onClick={() => submit(selected)}>
            {submitting && <Spinner className="mr-1.5 h-3.5 w-3.5" />}{label('createSelectedWorkspaces', 'Create selected workspaces')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateWorkspaceDialog;
