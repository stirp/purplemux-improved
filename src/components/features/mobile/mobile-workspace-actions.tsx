import { useState } from 'react';
import { GitBranch, Pencil, Settings, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from '@/components/ui/alert-dialog';
import EditWorkspaceDialog from '@/components/features/workspace/edit-workspace-dialog';
import CreateWorktreeDialog from '@/components/features/workspace/create-worktree-dialog';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import type { IWorkspace } from '@/types/terminal';

export default function MobileWorkspaceActions({ workspace, onCreated }: {
  workspace: IWorkspace;
  onCreated: (workspaceId: string) => void;
}) {
  const tc = useTranslations('common');
  const ts = useTranslations('sidebar');
  const tw = useTranslations('workspace');
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<'edit' | 'create' | 'delete' | null>(null);
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
  const itemClass = 'flex min-h-11 w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent';

  return <>
    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
      <PopoverTrigger render={<button
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        aria-label={`${tc('settings')}: ${workspace.name}`}
      />}>
        <Settings size={16} />
      </PopoverTrigger>
      <PopoverContent side="bottom" align="end" className="w-56 gap-0 p-1">
        <button className={itemClass} onClick={() => openAction('edit')}>
          <Pencil size={16} />{tw('editTitle')}
        </button>
        <button className={itemClass} onClick={() => openAction('create')}>
          <GitBranch size={16} />{tw('worktree.create')}
        </button>
        <button className={`${itemClass} text-ui-red`} onClick={() => openAction('delete')}>
          <Trash2 size={16} />{tc('delete')}
        </button>
      </PopoverContent>
    </Popover>
    {action === 'edit' && <EditWorkspaceDialog
      open onOpenChange={(open) => { if (!open) setAction(null); }}
      workspaceId={workspace.id} currentName={workspace.name}
    />}
    {action === 'create' && <CreateWorktreeDialog
      workspace={workspace} onClose={() => setAction(null)} onCreated={onCreated}
    />}
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
}
