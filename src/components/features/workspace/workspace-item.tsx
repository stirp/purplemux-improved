import ContextMenuSettingsButton from "@/components/ui/context-menu-settings-button";
import { useCallback, useEffect, useId, useMemo, useState, memo } from 'react';
import { Pencil, Trash2, FolderPlus, FolderMinus, Folder, GitBranch, ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { ITab, IWorkspace } from '@/types/terminal';
import useTabStore, { selectWorkspacePortsLabel } from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useInlineEdit from '@/hooks/use-inline-edit';
import WorkspaceStatusIndicator from '@/components/features/workspace/workspace-status-indicator';
import CreateWorktreeDialog from '@/components/features/workspace/create-worktree-dialog';
import WorktreeTreeDialog from '@/components/features/workspace/worktree-tree-dialog';
import WorkspaceTreeGuides, { WORKSPACE_TREE_INDENT } from '@/components/features/workspace/workspace-tree-guides';
import WorktreeManagementButton from '@/components/features/workspace/worktree-management-button';
import { getWorkspaceTreePosition } from '@/lib/workspace-order';

interface IWorkspaceItemProps {
  workspace: IWorkspace;
  isActive: boolean;
  isDeleting: boolean;
  childrenExpanded?: boolean;
  onToggleExpanded?: (workspaceId: string) => void;
  shortcutLabel?: string;
  showShortcut: boolean;
  tabs?: ITab[];
  onSelect: (workspaceId: string) => void;
  onRename: (workspaceId: string, name: string) => void;
  onDelete: (workspaceId: string) => void;
}

const WorkspaceItem = ({
  workspace,
  isActive,
  isDeleting,
  childrenExpanded,
  onToggleExpanded,
  shortcutLabel,
  showShortcut,
  tabs,
  onSelect,
  onRename,
  onDelete,
}: IWorkspaceItemProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const ts = useTranslations('sidebar');
  const groups = useWorkspaceStore((s) => s.groups);
  const tw = useTranslations('workspace.worktree');
  const [creatingWorktree, setCreatingWorktree] = useState(false);
  const [showTree, setShowTree] = useState(false);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const [menuOpen, setMenuOpen] = useState(false);
  const statusId = useId();
  const tm = useTranslations('workspace.worktreeManager');
  const treeLabel = useTranslations('workspace.worktreeTree');
  const position = useMemo(() => getWorkspaceTreePosition(workspaces, workspace.id), [workspaces, workspace.id]);
  const depth = position.rails.length;

  const { isEditing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit({
      value: workspace.name,
      onCommit: (next) => onRename(workspace.id, next),
      onEmpty: () =>
        (workspace.directories[0] ?? '').split('/').filter(Boolean).pop() || workspace.name,
    });

  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail === workspace.id) {
        startEditing();
      }
    };
    window.addEventListener('rename-workspace', handler);
    return () => window.removeEventListener('rename-workspace', handler);
  }, [workspace.id, startEditing]);

  const handleClick = useCallback(() => {
    if (!isEditing) {
      onSelect(workspace.id);
    }
  }, [isEditing, onSelect, workspace.id]);

  const handleMoveToGroup = useCallback((groupId: string | null) => {
    useWorkspaceStore.getState().moveWorkspaceToGroup(workspace.id, groupId);
  }, [workspace.id]);

  const handleCreateGroupAndMove = useCallback(async () => {
    const store = useWorkspaceStore.getState();
    const defaultName = ts('defaultGroupName');
    const group = await store.createGroup(defaultName);
    if (group) {
      store.moveWorkspaceToGroup(workspace.id, group.id);
    }
  }, [workspace.id, ts]);

  const portsLabel = useTabStore((state) => selectWorkspacePortsLabel(state.tabs, workspace.id));
  const details = [workspace.name, ...workspace.directories, workspace.worktree?.branch, portsLabel].filter(Boolean).join('\n');

  return (
    <>
    <ContextMenu onOpenChange={setMenuOpen}>
      <ContextMenuTrigger
        touchDrag
        data-touch-context-menu
        data-menu-open={menuOpen || undefined}
        title={details}
        aria-label={details}
        aria-describedby={shortcutLabel && showShortcut ? undefined : statusId}
        className={cn(
          'workspace-tree-row workspace-tree-row-compact relative flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-transparent py-1.5 pr-1.5 transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-purple [@media(pointer:coarse)]:min-h-11',
          isActive
            ? 'bg-ui-purple/15 text-sidebar-foreground before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:bg-ui-purple'
            : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
        )}
        style={{
          paddingLeft: 8 + depth * WORKSPACE_TREE_INDENT,
          opacity: isDeleting ? 0.5 : 1,
          transition: 'opacity 150ms, background-color 75ms',
        }}
        onClick={handleClick}
        onDoubleClick={startEditing}
        role="button"
        aria-current={isActive ? 'true' : undefined}
        aria-expanded={childrenExpanded}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', {
              bubbles: true, cancelable: true, clientX: rect.left, clientY: rect.bottom,
            }));
          }
          if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            handleClick();
          }
        }}
        tabIndex={0}
        render={<div />}
      >
        <WorkspaceTreeGuides position={position} expanded={childrenExpanded} />
        {childrenExpanded !== undefined ? (
          <Button
            variant="ghost" size="icon"
            className="-my-1.5 -mx-1.5 h-8 w-6 shrink-0 text-muted-foreground [@media(pointer:coarse)]:h-11"
            aria-label={workspace.name}
            aria-expanded={childrenExpanded}
            disabled={!onToggleExpanded || isDeleting}
            draggable
            data-touch-drag-ignore
            onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onDoubleClick={(event) => event.stopPropagation()}
            onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onClick={(event) => { event.stopPropagation(); onToggleExpanded?.(workspace.id); }}
          >
            {childrenExpanded
              ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
              : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
          </Button>
        ) : <span className="w-3 shrink-0" aria-hidden="true" />}
        {workspace.worktree || depth > 0
          ? <GitBranch aria-hidden="true" className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'text-ui-purple' : 'text-muted-foreground')} />
          : <Folder aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
        {isEditing ? (
          <input
            ref={inputRef}
            className="min-w-0 flex-1 border-b border-accent-color bg-transparent p-0 text-sm leading-normal text-foreground outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
          />
        ) : (
          <span className={cn('min-w-0 flex-1 truncate text-sm leading-normal', isActive && 'font-medium')}>
            {workspace.name}
          </span>
        )}
        {position.childCount > 0 && <span className="workspace-child-count shrink-0 px-0.5 text-[10px] tabular-nums text-muted-foreground">{position.childCount}</span>}
        {shortcutLabel && showShortcut ? (
          <span className="pointer-events-none shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] font-medium leading-none text-muted-foreground">{shortcutLabel}</span>
        ) : <WorkspaceStatusIndicator id={statusId} workspaceId={workspace.id} tabs={tabs} compact />}
        <div className="workspace-row-actions -my-1.5 flex shrink-0 items-center">
          {depth === 0 && workspace.directories.length > 0 && <span className="workspace-row-management"><WorktreeManagementButton name={workspace.name} onClick={() => setShowTree(true)} /></span>}
          <ContextMenuSettingsButton className="workspace-row-settings h-8 w-8" label={`${tc('settings')}: ${workspace.name}`} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => setCreatingWorktree(true)}>
          <GitBranch className="mr-2 h-3.5 w-3.5" />{tw('create')}
        </ContextMenuItem>
        <ContextMenuItem onClick={() => setShowTree(true)}>
          <GitBranch className="mr-2 h-3.5 w-3.5" />{treeLabel('manageTitle')}
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={!!workspace.parentWorkspaceId}>
            <Folder className="mr-2 h-3.5 w-3.5" />
            {ts('moveToGroup')}
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {groups.map((g) => (
              <ContextMenuItem
                key={g.id}
                disabled={workspace.groupId === g.id}
                onClick={() => handleMoveToGroup(g.id)}
              >
                <Folder className="mr-2 h-3.5 w-3.5" />
                {g.name}
              </ContextMenuItem>
            ))}
            {groups.length > 0 && <ContextMenuSeparator />}
            <ContextMenuItem onClick={handleCreateGroupAndMove}>
              <FolderPlus className="mr-2 h-3.5 w-3.5" />
              {ts('newGroup')}
            </ContextMenuItem>
            {workspace.groupId && (
              <>
                <ContextMenuSeparator />
                <ContextMenuItem onClick={() => handleMoveToGroup(null)}>
                  <FolderMinus className="mr-2 h-3.5 w-3.5" />
                  {ts('removeFromGroup')}
                </ContextMenuItem>
              </>
            )}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onClick={startEditing}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          {t('rename')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-ui-red focus:text-ui-red"
          onClick={() => onDelete(workspace.id)}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          {workspace.worktree ? tm('removeWorkspace') : tc('delete')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    {creatingWorktree && <CreateWorktreeDialog workspace={workspace}
      onClose={() => setCreatingWorktree(false)} onCreated={onSelect} />}
    {showTree && <WorktreeTreeDialog root={workspace} onClose={() => setShowTree(false)} onSelect={onSelect} />}
    </>
  );
};

export default memo(WorkspaceItem);
