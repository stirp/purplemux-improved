import { useRef, useState, type ReactNode } from 'react';
import { Folder, GitBranch, Pencil, Settings, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import DeleteWorkspaceDialog from '@/components/features/workspace/delete-workspace-dialog';
import EditWorkspaceDialog from '@/components/features/workspace/edit-workspace-dialog';
import CreateWorktreeDialog from '@/components/features/workspace/create-worktree-dialog';
import WorktreeTreeDialog from '@/components/features/workspace/worktree-tree-dialog';
import type { IWorkspace } from '@/types/terminal';
import WorktreeManagementButton from '@/components/features/workspace/worktree-management-button';

export default function MobileWorkspaceActions({ workspace, onCreated, children, isRoot = !workspace.parentWorkspaceId }: {
  workspace: IWorkspace;
  onCreated: (workspaceId: string) => void;
  children: ReactNode;
  isRoot?: boolean;
}) {
  const tc = useTranslations('common');
  const ts = useTranslations('sidebar');
  const tw = useTranslations('workspace');
  const tt = useTranslations('terminal');
  const [menuOpen, setMenuOpen] = useState(false);
  const touchOrigin = useRef(false);
  const [action, setAction] = useState<'group' | 'rename' | 'tree' | 'create' | 'delete' | null>(null);

  const openAction = (next: typeof action) => {
    setMenuOpen(false);
    setAction(next);
  };
  const itemClass = 'flex min-h-11 w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-accent disabled:pointer-events-none disabled:opacity-50';

  return <>
    <div
      className="workspace-tree-row relative flex items-start pr-1"
      data-menu-open={menuOpen || undefined}
      onPointerDown={(event) => { touchOrigin.current = event.pointerType === 'touch'; }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (touchOrigin.current && event.nativeEvent.isTrusted) return;
        setMenuOpen(true);
      }}
      onKeyDown={(event) => {
        touchOrigin.current = false;
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen(true);
        }
      }}
    >
      {children}
      {isRoot && workspace.directories.length > 0 && <div className="mt-1 shrink-0">
        <WorktreeManagementButton name={workspace.name} onClick={() => openAction('tree')} />
      </div>}
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger render={<button
          className="workspace-row-settings mt-1 flex h-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
          aria-label={`${tc('settings')}: ${workspace.name}`}
        />}>
          <Settings size={16} />
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-56 gap-0 p-1">
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
        </PopoverContent>
      </Popover>
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
    {action === 'delete' && <DeleteWorkspaceDialog
      key={workspace.id} workspace={workspace} onClose={() => setAction(null)}
    />}
  </>;
}
