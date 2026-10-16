import { useRef, useState, type ReactNode } from 'react';
import { Folder, GitBranch, Pencil, MoreHorizontal, Trash2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription, SheetClose } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import useTabStore, { selectWorkspacePortsLabel } from '@/hooks/use-tab-store';
import WorkspaceStatusIndicator from '@/components/features/workspace/workspace-status-indicator';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import EditWorkspaceDialog from '@/components/features/workspace/edit-workspace-dialog';
import CreateWorktreeDialog from '@/components/features/workspace/create-worktree-dialog';
import WorktreeTreeDialog from '@/components/features/workspace/worktree-tree-dialog';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspace, ITab } from '@/types/terminal';

const MobileWorkspaceActions = ({ workspace, onCreated, children, isActive = false, tabs }: {
  workspace: IWorkspace;
  onCreated: (workspaceId: string) => void;
  children: ReactNode;
  isActive?: boolean;
  tabs?: ITab[];
}) => {
  const tc = useTranslations('common');
  const ts = useTranslations('sidebar');
  const tw = useTranslations('workspace');
  const ports = useTabStore((state) => selectWorkspacePortsLabel(state.tabs, workspace.id));
  const tt = useTranslations('terminal');
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const touchOrigin = useRef(false);
  const [action, setAction] = useState<'group' | 'rename' | 'tree' | 'create' | 'delete' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    const store = useWorkspaceStore.getState();
    store.markPendingDelete(workspace.id);
    try {
      if (await store.deleteWorkspace(workspace.id)) {
        store.removeWorkspace(workspace.id);
        setAction(null);
      }
    } finally {
      store.unmarkPendingDelete(workspace.id);
      setDeleting(false);
    }
  };

  const openAction = (next: typeof action) => {
    setMenuOpen(false);
    setAction(next);
  };
  const itemClass = 'flex min-h-12 w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50';

  return <>
    <div
      className={cn('relative flex min-h-12 items-center rounded-md border border-transparent',
        isActive && 'border-ui-purple/10 bg-ui-purple/15 before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-ui-purple')}
      data-mobile-workspace={workspace.id}
      data-menu-open={menuOpen || undefined}
      onPointerDown={(event) => { touchOrigin.current = event.pointerType === 'touch'; }}
      onContextMenu={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        event.preventDefault();
        event.stopPropagation();
        if (touchOrigin.current && event.nativeEvent.isTrusted) return;
        setMenuOpen(true);
      }}
      onKeyDown={(event) => {
        if (!event.currentTarget.contains(event.target as Node)) return;
        touchOrigin.current = false;
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen(true);
        }
      }}
    >
      {children}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger render={<Button ref={triggerRef} variant="ghost" size="icon"
          className="size-11 shrink-0 text-muted-foreground" data-touch-drag-ignore
          aria-label={`${tc('settings')}: ${workspace.name}`}
        />}>
          <MoreHorizontal size={18} />
        </SheetTrigger>
        <SheetContent side="bottom" showCloseButton={false}
          finalFocus={action ? false : triggerRef}
          className="mobile-workspace-actions font-sans max-h-[85vh] gap-0 overflow-y-auto rounded-t-xl border bg-sidebar px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-none">
          <div className="mx-auto mb-2 h-1 w-8 shrink-0 rounded-full bg-muted-foreground/25" />
          <div className="flex items-start gap-2">
            <SheetTitle className="min-w-0 flex-1 break-words py-2">{workspace.name}</SheetTitle>
            <SheetClose render={<Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={tc('close')} />}><X size={18} /></SheetClose>
          </div>
          <SheetDescription render={<div />} className="select-text space-y-2 break-words pb-4 text-xs [overflow-wrap:anywhere]">
            {workspace.directories.map((directory, index) => <p key={`${index}:${directory}`} className="flex items-start gap-2"><Folder size={14} className="mt-0.5 shrink-0" /><span>{directory}</span></p>)}
            {workspace.worktree && <p className="flex items-start gap-2"><GitBranch size={14} className="mt-0.5 shrink-0" /><span>{workspace.worktree.branch}</span></p>}
            {ports && <p>{ports}</p>}
            <WorkspaceStatusIndicator workspaceId={workspace.id} tabs={tabs} />
          </SheetDescription>
          <div data-mobile-workspace-menu className="border-t pt-2">
            <button className={itemClass} onClick={() => openAction('create')}>
              <GitBranch size={16} />{tw('worktree.create')}
            </button>
            <button className={itemClass} onClick={() => openAction('tree')}>
              <GitBranch size={16} />{tw('worktreeTree.manageTitle')}
            </button>
            <button className={itemClass} disabled={!!workspace.parentWorkspaceId} onClick={() => openAction('group')}>
              <Folder size={16} />{ts('moveToGroup')}
            </button>
            <button className={itemClass} onClick={() => openAction('rename')}>
              <Pencil size={16} />{tt('rename')}
            </button>
            <hr className="my-1 border-border" />
            <button className={`${itemClass} text-ui-red`} onClick={() => openAction('delete')}>
              <Trash2 size={16} />{tc('delete')}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
    {(action === 'group' || action === 'rename') && <EditWorkspaceDialog
      key={action} mode={action}
      open onOpenChange={(open) => { if (!open) setAction(null); }}
      workspaceId={workspace.id} currentName={workspace.name}
    />}
    {action === 'create' && <CreateWorktreeDialog
      workspace={workspace} onClose={() => setAction(null)} onCreated={onCreated}
    />}
    {action === 'tree' && <WorktreeTreeDialog root={workspace} onClose={() => setAction(null)} onSelect={onCreated} />}
    {action === 'delete' && <AlertDialog open onOpenChange={(open) => {
      if (!open && !deleting) setAction(null);
    }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{ts('deleteWorkspace')}</AlertDialogTitle>
          <AlertDialogDescription>
            {ts('deleteWorkspaceConfirm', { name: workspace.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" disabled={deleting} onClick={() => setAction(null)}>{tc('cancel')}</Button>
          <Button className="bg-ui-red hover:bg-ui-red/80" disabled={deleting} onClick={remove}>{tc('delete')}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>}
  </>;
};

export default MobileWorkspaceActions;
