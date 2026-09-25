import { useCallback, useState, memo } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, FolderMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import useInlineEdit from '@/hooks/use-inline-edit';
import type { IWorkspaceGroup } from '@/types/terminal';

interface IWorkspaceGroupHeaderProps {
  group: IWorkspaceGroup;
  count: number;
  onToggle: (groupId: string) => void;
  onRename: (groupId: string, name: string) => void;
  onUngroup: (groupId: string) => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragEnd: (event: React.DragEvent) => void;
}

const WorkspaceGroupHeader = ({
  group,
  count,
  onToggle,
  onRename,
  onUngroup,
  onDragStart,
  onDragEnd,
}: IWorkspaceGroupHeaderProps) => {
  const t = useTranslations('sidebar');
  const [menuOpen, setMenuOpen] = useState(false);
  const { isEditing, draft, setDraft, inputRef, startEditing, commit, handleKeyDown } =
    useInlineEdit({
      value: group.name,
      onCommit: (next) => onRename(group.id, next),
    });

  const handleToggle = useCallback(() => {
    if (!isEditing) onToggle(group.id);
  }, [isEditing, group.id, onToggle]);

  const handleRenameAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    startEditing();
  }, [startEditing]);

  const handleUngroupAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onUngroup(group.id);
  }, [group.id, onUngroup]);

  const Icon = group.collapsed ? ChevronRight : ChevronDown;

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className="group relative flex h-7 cursor-grab items-center gap-1 px-2 text-sm font-medium tracking-wide text-muted-foreground hover:bg-sidebar-accent/50 active:cursor-grabbing"
        onClick={handleToggle}
        draggable={!isEditing}
        onDragStart={(event) => {
          if ((event.target as HTMLElement).closest('button, input')) {
            event.preventDefault();
            return;
          }
          onDragStart(event);
        }}
        onDragEnd={onDragEnd}
        render={<div />}
      >
        <Icon className="h-3 w-3 shrink-0" />
        {isEditing ? (
          <input
            ref={inputRef}
            className="min-w-0 flex-1 bg-transparent p-0 text-sm font-medium tracking-wide text-foreground outline-none"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate">
            {group.name} <span className="text-muted-foreground/60">({count})</span>
          </span>
        )}
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger
            render={
              <button
                className={cn(
                  'ml-0.5 flex h-5 w-5 items-center justify-center rounded transition-opacity hover:bg-sidebar-accent',
                  menuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
                onClick={(e) => e.stopPropagation()}
                aria-label={t('renameGroup')}
              />
            }
          >
            <MoreHorizontal className="h-3 w-3" />
          </PopoverTrigger>
          <PopoverContent side="right" align="start" className="w-44 gap-0 p-1">
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              onClick={handleRenameAction}
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('renameGroup')}
            </button>
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent"
              onClick={handleUngroupAction}
            >
              <FolderMinus className="h-3.5 w-3.5" />
              {t('ungroup')}
            </button>
          </PopoverContent>
        </Popover>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={handleRenameAction}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          {t('renameGroup')}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleUngroupAction}>
          <FolderMinus className="mr-2 h-3.5 w-3.5" />
          {t('ungroup')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export default memo(WorkspaceGroupHeader);
