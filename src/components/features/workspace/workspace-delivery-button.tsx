import { useEffect, useState } from 'react';
import { GitPullRequest } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { IWorktreeOverview, TWorktreeSnapshot } from '@/types/worktree';
import WorktreeDeliveryDialog from './worktree-delivery-dialog';
import { cn } from '@/lib/utils';

export default function WorkspaceDeliveryButton({ workspaceId, className }: { workspaceId: string; className?: string }) {
  const t = useTranslations('workspace.worktreeManager');
  const [choosing, setChoosing] = useState(false);
  const [delivery, setDelivery] = useState<TWorktreeSnapshot | null>(null);
  const [targets, setTargets] = useState<TWorktreeSnapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!choosing) return;
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/workspace/worktrees?workspaceId=${encodeURIComponent(workspaceId)}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t('unknown'));
        if (controller.signal.aborted) return;
        const overview = data as IWorktreeOverview;
        const available = overview.repositories.flatMap((repository) => repository.worktrees
          .filter((item) => !item.missing && item.workspaces.some((workspace) => workspace.id === workspaceId))
          .map((item): TWorktreeSnapshot => ({
            repositoryId: repository.id, directory: item.directory, head: item.head, branch: item.branch,
          })));
        setTargets(available);
        if (available.length === 1) { setDelivery(available[0]); setChoosing(false); }
        else if (!available.length && overview.errors.length) setError(overview.errors.map((entry) => entry.error).join('\n'));
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [choosing, workspaceId, t]);

  return <span className="contents" onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}>
    <button
      type="button"
      className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground', className)}
      title={t('deliveryTitle')}
      aria-label={t('deliveryTitle')}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setTargets([]); setError(''); setLoading(true); setChoosing(true);
      }}
    >
      <GitPullRequest aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
    {choosing && <Dialog open onOpenChange={setChoosing}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{t('deliveryTitle')}</DialogTitle></DialogHeader>
        {loading && <p role="status">{t('loading')}</p>}
        {error && <p role="alert" className="whitespace-pre-wrap break-all text-ui-red">{error}</p>}
        {!loading && !error && !targets.length && <p>{t('empty')}</p>}
        {targets.map((target) => <Button key={target.directory} variant="outline"
          className="h-auto justify-start whitespace-normal break-all text-left"
          onClick={(event) => { event.stopPropagation(); setChoosing(false); setDelivery(target); }}>
          {target.directory}
        </Button>)}
      </DialogContent>
    </Dialog>}
    {delivery && <WorktreeDeliveryDialog workspaceId={workspaceId} item={delivery}
      onClose={() => setDelivery(null)} />}
  </span>;
}
