import { useCallback, useState, memo } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Pencil, FolderMinus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import type { IWorkspaceGroup } from '@/types/terminal';

interface IMobileWorkspaceGroupHeaderProps {
  group: IWorkspaceGroup;
  count: number;
  onToggle: (groupId: string) => void;
  onRenameRequest: (groupId: string) => void;
  onUngroup: (groupId: string) => void;
}

const MobileWorkspaceGroupHeader = ({
  group,
  count,
  onToggle,
  onRenameRequest,
  onUngroup,
}: IMobileWorkspaceGroupHeaderProps) => {
  const t = useTranslations('sidebar');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleToggle = useCallback(() => {
    onToggle(group.id);
  }, [group.id, onToggle]);

  const handleRenameAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onRenameRequest(group.id);
  }, [group.id, onRenameRequest]);

  const handleUngroupAction = useCallback((e: React.SyntheticEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onUngroup(group.id);
  }, [group.id, onUngroup]);

  const Icon = group.collapsed ? ChevronRight : ChevronDown;

  return (
    <div className="flex min-h-11 items-center px-1 text-xs font-medium text-muted-foreground">
      <Button variant="ghost" className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2 px-2 text-xs aria-expanded:bg-transparent" onClick={handleToggle} aria-expanded={!group.collapsed}>
        <Icon size={12} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{group.name}</span>
        <span className="text-muted-foreground/70">{count}</span>
      </Button>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          render={
            <button
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50"
              onClick={(e) => e.stopPropagation()}
              aria-label={t('renameGroup')}
            />
          }
        >
          <MoreHorizontal size={14} />
        </PopoverTrigger>
        <PopoverContent side="bottom" align="end" className="w-44 gap-0 p-1">
          <button
            className="flex min-h-11 w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
            onClick={handleRenameAction}
          >
            <Pencil size={14} />
            {t('renameGroup')}
          </button>
          <button
            className="flex min-h-11 w-full items-center gap-2 rounded px-2 py-2 text-left text-sm transition-colors hover:bg-accent"
            onClick={handleUngroupAction}
          >
            <FolderMinus size={14} />
            {t('ungroup')}
          </button>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default memo(MobileWorkspaceGroupHeader);
