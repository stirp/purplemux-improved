import { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, GitBranch, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { requestWorktreeAction } from '@/lib/worktree-action-client';
import type { IWorkspace } from '@/types/terminal';
import type { IWorktreeOverview, IWorktreeSyncInfo, IWorktreeSyncResult, TWorktreeSnapshot } from '@/types/worktree';
import WorktreeDeliveryDialog from '@/components/features/workspace/worktree-delivery-dialog';
import ManageWorktreesDialog from '@/components/features/workspace/manage-worktrees-dialog';

interface IEdge {
  parent: IWorkspace;
  child: IWorkspace;
  parentItem: TWorktreeSnapshot;
  childItem: TWorktreeSnapshot;
  info: IWorktreeSyncInfo | null;
  error?: string;
  depth: number;
}

export default function WorktreeTreeDialog({ root, onClose, onSelect }: { root: IWorkspace; onClose: () => void; onSelect: (id: string) => void }) {
  const t = useTranslations('workspace.worktreeTree');
  const managerLabel = useTranslations('workspace.worktreeManager');
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const [overview, setOverview] = useState<IWorktreeOverview | null>(null);
  const [edges, setEdges] = useState<IEdge[]>([]);
  const [loadError, setLoadError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [managerBusy, setManagerBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const hasChildren = workspaces.some((item) => item.parentWorkspaceId === root.id);
  const [view, setView] = useState<'tree' | 'repository'>(hasChildren ? 'tree' : 'repository');
  const [openedRepository, setOpenedRepository] = useState(!hasChildren);
  const [confirm, setConfirm] = useState<{ edge: IEdge; direction: 'parent' | 'child' } | null>(null);
  const [recovery, setRecovery] = useState<TWorktreeSnapshot | null>(null);
  const descendants = useMemo(() => {
    const result: { parent: IWorkspace; child: IWorkspace; depth: number }[] = [];
    const visit = (parent: IWorkspace, depth: number, seen: Set<string>) => {
      for (const child of workspaces.filter((item) => item.parentWorkspaceId === parent.id && !seen.has(item.id))) {
        result.push({ parent, child, depth });
        visit(child, depth + 1, new Set([...seen, child.id]));
      }
    };
    visit(root, 0, new Set([root.id]));
    return result;
  }, [root, workspaces]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/workspace/worktrees?workspaceId=${encodeURIComponent(root.id)}`, { signal: controller.signal });
        const data: IWorktreeOverview & { error?: string } = await response.json();
        if (!response.ok) throw new Error(data.error);
        const entries = await Promise.all(descendants.map(async ({ parent, child, depth }): Promise<IEdge> => {
          const repository = data.repositories.find((repo) => repo.worktrees.some((item) => item.workspaces.some((linked) => linked.id === child.id)));
          const find = (ws: IWorkspace) => {
            const item = repository?.worktrees.find((item) => item.workspaces.some((linked) => linked.id === ws.id));
            return repository && item && { repositoryId: repository.id, directory: item.directory, head: item.head, branch: item.branch };
          };
          const parentItem = find(parent);
          const childItem = find(child);
          if (!parentItem || !childItem || !parentItem.branch || !childItem.branch) {
            return { parent, child, depth, parentItem: parentItem!, childItem: childItem!, info: null, error: t('unavailable') };
          }
          try {
            const info = await requestWorktreeAction<IWorktreeSyncInfo>(root.id, 'inspectSync', {
              item: childItem, targetRef: `refs/heads/${parentItem.branch}`,
            }, controller.signal);
            return { parent, child, depth, parentItem, childItem, info };
          } catch (reason) {
            return { parent, child, depth, parentItem, childItem, info: null, error: reason instanceof Error ? reason.message : String(reason) };
          }
        }));
        if (!controller.signal.aborted) { setOverview(data); setEdges(entries); setLoadError(''); }
      } catch (reason) {
        if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void load();
    return () => controller.abort();
  }, [root.id, descendants, refresh, t]);

  const merge = async () => {
    if (!confirm || busy) return;
    const { edge, direction } = confirm;
    const destination = direction === 'parent' ? edge.parentItem : edge.childItem;
    const incoming = direction === 'parent' ? edge.childItem : edge.parentItem;
    setBusy(true);
    setOperationError('');
    try {
      const check = await requestWorktreeAction<IWorktreeSyncInfo>(root.id, 'inspectSync', {
        item: destination, targetRef: `refs/heads/${incoming.branch}`,
      });
      if (check.blockers.some((reason) => reason !== 'main') || check.operation || check.targetHead !== incoming.head) {
        throw new Error(t('changed'));
      }
      const result = await requestWorktreeAction<IWorktreeSyncResult>(root.id, 'merge', {
        item: destination, targetRef: `refs/heads/${incoming.branch}`, targetHead: incoming.head,
      });
      if (!result.ok) {
        setOperationError(`${result.output || t('operationFailed')}${result.operation && check.blockers.includes('main') ? `\n${t('mainRecovery')}` : ''}`);
        if (result.operation && !check.blockers.includes('main')) setRecovery(destination);
      }
    } catch (reason) {
      setOperationError(reason instanceof Error ? reason.message : String(reason));
    } finally { setBusy(false); setConfirm(null); setRefresh((value) => value + 1); }
  };

  if (recovery) return <WorktreeDeliveryDialog workspaceId={root.id} item={recovery} onClose={() => { setRecovery(null); setRefresh((value) => value + 1); }} />;
  return <Dialog open onOpenChange={(open) => { if (!open && !busy && !managerBusy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-4xl" showCloseButton={!busy && !managerBusy}>
      <DialogHeader><DialogTitle>{t('manageTitle')} · {root.name}</DialogTitle><DialogDescription>{hasChildren ? t('description') : managerLabel('description')}</DialogDescription></DialogHeader>
      <div role="tablist" aria-label={t('title')} className="flex gap-2 border-b pb-2">
        {hasChildren && <Button role="tab" aria-selected={view === 'tree'} variant={view === 'tree' ? 'secondary' : 'ghost'} size="sm" disabled={busy || managerBusy} onClick={() => setView('tree')}>{t('relationships')}</Button>}
        <Button role="tab" aria-selected={view === 'repository'} variant={view === 'repository' ? 'secondary' : 'ghost'} size="sm" disabled={busy || managerBusy} onClick={() => { setView('repository'); setOpenedRepository(true); }}>{managerLabel('title')}</Button>
      </div>
      <div role="tabpanel" hidden={view !== 'tree'}>
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 font-medium"><span className="flex items-center gap-2"><GitBranch size={16} />{root.name}</span><Button size="sm" variant="outline" disabled={busy} onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={14} />{t('refresh')}</Button></div>
      {loadError && <p role="alert" className="whitespace-pre-wrap break-all text-sm text-ui-red">{loadError}</p>}
      {operationError && <p role="alert" className="whitespace-pre-wrap break-all text-sm text-ui-red">{operationError}</p>}
      {!overview && !loadError && <p role="status">{t('loading')}</p>}
      {confirm && <div className="rounded-lg border p-3"><p>{t('confirm', { source: confirm.direction === 'parent' ? confirm.edge.child.name : confirm.edge.parent.name, destination: confirm.direction === 'parent' ? confirm.edge.parent.name : confirm.edge.child.name })}</p><div className="mt-3 flex gap-2"><Button disabled={busy} onClick={() => void merge()}>{t('merge')}</Button><Button variant="outline" disabled={busy} onClick={() => setConfirm(null)}>{t('cancel')}</Button></div></div>}
      {edges.map((edge) => <div key={edge.child.id} className="rounded-lg border-l-2 border-ui-blue bg-muted/20 p-3" style={{ marginLeft: Math.min(edge.depth, 4) * 16 }}>
        <div className="flex items-center gap-2 font-medium"><ArrowDownRight size={16} className="text-ui-blue" /><span>{edge.parent.name}</span><span aria-hidden="true">→</span><span>{edge.child.name}</span></div>
        {edge.info ? <><p className="mt-2 text-sm">{t('childAhead', { count: edge.info.ahead ?? 0 })} · {t('parentAhead', { count: edge.info.behind ?? 0 })}</p>
          <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy || !!confirm || !edge.info.ahead || !!edge.info.operation} onClick={() => setConfirm({ edge, direction: 'parent' })}>{t('mergeIntoParent')}</Button><Button size="sm" variant="outline" disabled={busy || !!confirm || !edge.info.behind || !!edge.info.operation || !!edge.info.blockers.length} onClick={() => setConfirm({ edge, direction: 'child' })}>{t('mergeIntoChild')}</Button>{edge.info.operation && <Button size="sm" onClick={() => setRecovery(edge.childItem)}>{t('recover')}</Button>}</div>
          {!!edge.info.blockers.length && <p className="mt-2 text-xs text-muted-foreground">{edge.info.blockers.join(', ')}</p>}</> : <p role="status" className="mt-2 text-sm text-muted-foreground">{edge.error}</p>}
      </div>)}
      </div>
      {openedRepository && <div role="tabpanel" hidden={view !== 'repository'}>
        <ManageWorktreesDialog workspace={root} embedded onClose={onClose} onSelect={onSelect} onChanged={() => setRefresh((value) => value + 1)} onBusyChange={setManagerBusy} />
      </div>}
    </DialogContent>
  </Dialog>;
}
