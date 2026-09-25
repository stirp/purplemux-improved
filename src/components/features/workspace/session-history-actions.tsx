import { useState, type ReactElement } from 'react';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';

interface ISessionHistoryActionsProps {
  provider: 'claude' | 'codex';
  sessionId: string | null;
  historyEntryId?: string;
  label?: string | null;
  disabled?: boolean;
  onDeleted: () => Promise<void>;
  children: ReactElement;
}

const SessionHistoryActions = ({ provider, sessionId, historyEntryId, label, disabled, onDeleted, children }: ISessionHistoryActionsProps) => {
  const t = useTranslations('session');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [deleteOriginal, setDeleteOriginal] = useState(false);

  const remove = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const response = await fetch('/api/session-history', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, sessionId, historyEntryId, deleteOriginal }),
      });
      if (response.status === 409) {
        toast.error(t('deleteSessionInUse'));
        return;
      }
      if (!response.ok) throw new Error('Delete failed');
      setOpen(false);
      setRemoved(true);
      await onDeleted();
    } catch {
      toast.error(t('deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  if (removed) return null;

  return (
    <div className="relative" data-session-row>
      <ContextMenu>
        <ContextMenuTrigger render={children} />
        <ContextMenuContent>
          <ContextMenuItem variant="destructive" disabled={disabled} onClick={() => setOpen(true)}>
            <Trash2 size={14} />
            {t('deleteHistory')}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-ui-red disabled:opacity-30"
        aria-label={t('deleteHistory')}
        title={t('deleteHistory')}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2 size={14} />
      </button>
      <AlertDialog open={open} onOpenChange={(next) => { if (!deleting) setOpen(next); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteHistory')}</AlertDialogTitle>
            <AlertDialogDescription>{t(deleteOriginal ? 'deleteOriginalDescription' : 'deleteHistoryDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <p className="truncate text-sm text-muted-foreground">{label || sessionId}</p>
          {sessionId && <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={deleteOriginal} onCheckedChange={setDeleteOriginal} disabled={deleting} />
            {t('deleteOriginalSession', { provider: provider === 'codex' ? 'Codex' : 'Claude' })}
          </label>}
          {deleteOriginal && <p className="text-sm text-ui-red">{t('deleteOriginalWarning')}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{tc('cancel')}</AlertDialogCancel>
            <Button variant="destructive" disabled={deleting} onClick={remove}>{t(deleteOriginal ? 'deletePermanently' : 'deleteHistory')}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SessionHistoryActions;
