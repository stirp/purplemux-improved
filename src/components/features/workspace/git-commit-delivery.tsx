import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { requestWorktreeAction } from '@/lib/worktree-action-client';
import WorktreeDraftForm from '@/components/features/workspace/worktree-draft-form';
import type { IWorktreeOverview, IWorktreeSyncInfo, TWorktreeSnapshot } from '@/types/worktree';

export default function GitCommitDelivery({ sessionName, directory, branch, head, onBusy }: {
  sessionName: string; directory: string; branch: string; head: string; onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations('diff.commit');
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const workspace = workspaces.find((item) => sessionName.startsWith(`pt-${item.id}-pane-`));
  const [target, setTarget] = useState<{ item: TWorktreeSnapshot; info: IWorktreeSyncInfo } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!workspace) { setError(t('deliveryUnavailable')); setLoading(false); return; }
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/workspace/worktrees?workspaceId=${encodeURIComponent(workspace.id)}`, { signal: controller.signal });
        const overview: IWorktreeOverview & { error?: string } = await response.json();
        if (!response.ok) throw new Error(overview.error);
        const repository = overview.repositories.find((entry) => entry.worktrees.some((item) =>
          item.directory === directory && item.workspaces.some((linked) => linked.id === workspace.id)));
        const worktree = repository?.worktrees.find((item) => item.directory === directory &&
          item.workspaces.some((linked) => linked.id === workspace.id));
        if (!repository || !worktree || worktree.head !== head || worktree.branch !== branch) throw new Error(t('deliveryUnavailable'));
        const item = { repositoryId: repository.id, directory: worktree.directory, head: worktree.head, branch: worktree.branch };
        const info = await requestWorktreeAction<IWorktreeSyncInfo>(workspace.id, 'inspectSync', { item }, controller.signal);
        if (info.head !== head || info.branch !== branch) throw new Error(t('deliveryUnavailable'));
        if (!controller.signal.aborted) { setTarget({ item, info }); setError(''); }
      } catch (reason) {
        if (!controller.signal.aborted) { setTarget(null); setError(reason instanceof Error ? reason.message : String(reason)); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [workspace, directory, branch, head, refresh, t]);

  return <section className="min-w-0 border-t pt-3">
    <h3 className="font-medium">{t('deliveryNext')}</h3>
    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{directory}</p>
    <p className="mt-1 break-all text-sm">{branch} · {head.slice(0, 8)}</p>
    {loading && <p role="status" className="text-sm">{t('deliveryLoading')}</p>}
    {error && <p role="alert" className="break-all text-sm text-muted-foreground">{error}</p>}
    {target && workspace && <WorktreeDraftForm workspaceId={workspace.id} item={target.item} info={target.info}
      disabled={loading} onBusy={onBusy} onDone={() => setRefresh((value) => value + 1)} />}
  </section>;
}
