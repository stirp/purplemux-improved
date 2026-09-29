import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import useWorkspaceStore from '@/hooks/use-workspace-store';

interface IEditWorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  currentName: string;
  mode?: 'edit' | 'rename' | 'group';
}

const EditWorkspaceDialog = ({
  open,
  onOpenChange,
  workspaceId,
  currentName,
  mode = 'edit',
}: IEditWorkspaceDialogProps) => {
  const t = useTranslations('workspace');
  const ts = useTranslations('sidebar');
  const tc = useTranslations('common');
  const tt = useTranslations('terminal');
  const groups = useWorkspaceStore((s) => s.groups);
  const isChildWorkspace = useWorkspaceStore(
    (s) => !!s.workspaces.find((w) => w.id === workspaceId)?.parentWorkspaceId,
  );
  const currentGroupId = useWorkspaceStore(
    (s) => s.workspaces.find((w) => w.id === workspaceId)?.groupId ?? null,
  );
  const [name, setName] = useState(currentName);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(currentGroupId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setName(currentName);
      setSelectedGroupId(currentGroupId);
      setIsSubmitting(false);
    }
  }

  const trimmed = name.trim();
  const nameChanged = mode !== 'group' && trimmed.length > 0 && trimmed !== currentName;
  const groupChanged = mode !== 'rename' && !isChildWorkspace && selectedGroupId !== currentGroupId;
  const canSubmit = (nameChanged || groupChanged) && !isSubmitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const store = useWorkspaceStore.getState();
    const results = await Promise.all([
      nameChanged ? store.renameWorkspace(workspaceId, trimmed) : Promise.resolve(true),
      groupChanged ? store.moveWorkspaceToGroup(workspaceId, selectedGroupId) : Promise.resolve(true),
    ]);
    setIsSubmitting(false);
    if (results.every(Boolean)) onOpenChange(false);
  }, [canSubmit, workspaceId, nameChanged, groupChanged, trimmed, selectedGroupId, onOpenChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && canSubmit) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [canSubmit, handleSubmit],
  );

  const UNGROUPED_VALUE = '__ungrouped__';
  const groupItems = [
    { label: ts('ungrouped'), value: UNGROUPED_VALUE },
    ...groups.map((g) => ({ label: g.name, value: g.id })),
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === 'rename' ? tt('rename') : mode === 'group' ? ts('moveToGroup') : t('editTitle')}</DialogTitle>
        </DialogHeader>

        {mode !== 'group' && <Input
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
        />}

        {mode !== 'rename' && !isChildWorkspace && (groups.length > 0 || mode === 'group') && (
          <Select
            items={groupItems}
            value={selectedGroupId ?? UNGROUPED_VALUE}
            onValueChange={(v) =>
              setSelectedGroupId(v === UNGROUPED_VALUE ? null : v)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupItems.map((it) => (
                <SelectItem key={it.value} value={it.value}>
                  {it.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            {tc('cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
            {tc('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditWorkspaceDialog;
