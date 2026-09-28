import { useState } from 'react';
import useSWR from 'swr';
import { GitPullRequest } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { IWorktreeOverview, TWorktreeSnapshot } from '@/types/worktree';
import WorktreeDeliveryDialog from './worktree-delivery-dialog';

const fetchOverview = async (url: string): Promise<IWorktreeOverview> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load worktree status');
  return response.json();
};

export default function WorkspaceDeliveryButton({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations('workspace.worktreeManager');
  const [choosing, setChoosing] = useState(false);
  const [delivery, setDelivery] = useState<TWorktreeSnapshot | null>(null);
  const { data, mutate } = useSWR(
    `/api/workspace/worktrees?workspaceId=${encodeURIComponent(workspaceId)}`,
    fetchOverview,
    { refreshInterval: choosing || delivery ? 0 : 30_000, revalidateOnFocus: true },
  );
  const targets = data?.repositories.flatMap((repository) => repository.worktrees
    .filter((item) => {
      const status = item.status;
      return item.workspaces.some((workspace) => workspace.id === workspaceId)
        && !item.missing && status && (status.modified > 0 || status.staged > 0
          || status.untracked > 0 || status.conflicts > 0 || (status.ahead ?? 0) > 0 || (status.behind ?? 0) > 0);
    })
    .map((item): TWorktreeSnapshot => ({
      repositoryId: repository.id, directory: item.directory, head: item.head, branch: item.branch,
    }))) ?? [];

  return <span className="contents" onClick={(event) => event.stopPropagation()}
    onDoubleClick={(event) => event.stopPropagation()}>
    {targets.length > 0 && <button
      type="button"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
      title={t('deliveryTitle')}
      aria-label={t('deliveryTitle')}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        if (targets.length === 1) setDelivery(targets[0]);
        else setChoosing(true);
      }}
    >
      <GitPullRequest aria-hidden="true" className="h-3.5 w-3.5" />
    </button>}
    {choosing && <Dialog open onOpenChange={setChoosing}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader><DialogTitle>{t('deliveryTitle')}</DialogTitle></DialogHeader>
        {targets.map((target) => <Button key={target.directory} variant="outline"
          className="h-auto justify-start whitespace-normal break-all text-left"
          onClick={(event) => { event.stopPropagation(); setChoosing(false); setDelivery(target); }}>
          {target.directory}
        </Button>)}
      </DialogContent>
    </Dialog>}
    {delivery && <WorktreeDeliveryDialog workspaceId={workspaceId} item={delivery}
      onClose={() => { setDelivery(null); void mutate(); }} />}
  </span>;
}
