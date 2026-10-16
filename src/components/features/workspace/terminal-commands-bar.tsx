import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import useTerminalCommands from '@/hooks/use-terminal-commands';
import { MAX_TERMINAL_COMMANDS, terminalCommandInput, terminalCommandSchema, type ITerminalCommand } from '@/lib/terminal-custom-commands';

interface ITerminalCommandsBarProps {
  sendStdin: (data: string) => void;
  connected: boolean;
}

const TerminalCommandsBar = ({ sendStdin, connected }: ITerminalCommandsBarProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const { commands, isLoading, error, reload, save } = useTerminalCommands();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const formId = useId();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Omit<ITerminalCommand, 'id'>>({
    resolver: zodResolver(terminalCommandSchema),
    defaultValues: { name: '', command: '' },
  });

  const edit = (command?: ITerminalCommand) => {
    reset(command ? { name: command.name, command: command.command } : { name: '', command: '' });
    setDeleting(null);
    setEditing(command?.id ?? '');
    setOpen(true);
  };

  const submit = handleSubmit(async (value) => {
    if (busy || editing === null) return;
    setBusy(true);
    try {
      await save(editing ? 'PATCH' : 'POST', { ...value, ...(editing ? { id: editing } : {}) });
      setEditing(null);
      toast.success(tc('saved'));
    } catch {
      toast.error(t('customCommandsSaveFailed'));
    } finally {
      setBusy(false);
    }
  });

  const remove = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await save('DELETE', { id });
      setDeleting(null);
    } catch {
      toast.error(t('customCommandsSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div role="toolbar" aria-label={t('customCommands')} className="flex shrink-0 items-center gap-2 border-t border-border bg-background px-3 py-1.5">
        <Button variant="ghost" size="icon-sm" aria-label={t('customCommandsManage')} title={t('customCommandsManage')}
          onClick={() => { setEditing(null); setDeleting(null); setOpen(true); }}>
          <Settings2 className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
          {commands.map((command) => (
            <Button key={command.id} variant="outline" size="sm" className="max-w-48 shrink-0 text-xs"
              title={command.command} disabled={!connected || !!error}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => { if (connected && !error) sendStdin(terminalCommandInput(command.command)); }}>
              <span className="truncate">{command.name}</span>
            </Button>
          ))}
          {!isLoading && !error && commands.length === 0 && (
            <Button variant="ghost" size="sm" className="shrink-0 text-xs text-muted-foreground" onClick={() => edit()}>
              <Plus className="size-3.5" />{t('customCommandsAdd')}
            </Button>
          )}
          {isLoading && <span className="text-xs text-muted-foreground">{tc('loading')}</span>}
          {error && <Button variant="ghost" size="sm" onClick={() => void reload().catch(() => {})}>{t('customCommandsLoadFailed')} · {tc('retry')}</Button>}
        </div>
      </div>
      <Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{t('customCommands')}</DialogTitle>
            <DialogDescription>{t('customCommandsDescription')}</DialogDescription>
          </DialogHeader>
          {editing !== null ? (
            <form onSubmit={submit} className="space-y-4">
              <fieldset disabled={busy} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-name`}>{t('customCommandsName')}</label>
                  <Input id={`${formId}-name`} maxLength={40} autoFocus {...register('name')}
                    aria-invalid={!!errors.name} aria-describedby={errors.name ? `${formId}-name-error` : undefined} />
                  {errors.name && <p id={`${formId}-name-error`} role="alert" className="text-xs text-destructive">{t('customCommandsNameInvalid')}</p>}
                </div>
                <div className="space-y-1.5">
                  <label htmlFor={`${formId}-command`}>{t('customCommandsContent')}</label>
                  <Textarea id={`${formId}-command`} rows={5} maxLength={4000} spellCheck={false} autoCapitalize="off" autoCorrect="off"
                    className="font-mono" placeholder="git status" {...register('command')}
                    aria-invalid={!!errors.command} aria-describedby={errors.command ? `${formId}-command-error` : undefined} />
                  {errors.command && <p id={`${formId}-command-error`} role="alert" className="text-xs text-destructive">{t('customCommandsContentInvalid')}</p>}
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditing(null)}>{tc('cancel')}</Button>
                  <Button type="submit">{busy ? tc('loading') : tc('save')}</Button>
                </div>
              </fieldset>
            </form>
          ) : (
            <div className="space-y-3">
              {error && <Button variant="outline" onClick={() => void reload().catch(() => {})}>{t('customCommandsLoadFailed')} · {tc('retry')}</Button>}
              {!error && !isLoading && commands.length === 0 && <p className="text-sm text-muted-foreground">{t('customCommandsEmpty')}</p>}
              {commands.map((command) => (
                <div key={command.id} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium">{command.name}</p>
                      <p className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">{command.command}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" disabled={busy || !!error} aria-label={`${tc('edit')} ${command.name}`} onClick={() => edit(command)}><Pencil className="size-3.5" /></Button>
                    <Button variant="ghost" size="icon-sm" disabled={busy || !!error} aria-label={`${tc('delete')} ${command.name}`} onClick={() => setDeleting(command.id)}><Trash2 className="size-3.5" /></Button>
                  </div>
                  {deleting === command.id && <div className="flex flex-wrap items-center justify-end gap-2">
                    <p className="mr-auto text-xs">{t('customCommandsDeleteConfirm')}</p>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setDeleting(null)}>{tc('cancel')}</Button>
                    <Button variant="destructive" size="sm" disabled={busy} onClick={() => void remove(command.id)}>{tc('delete')}</Button>
                  </div>}
                </div>
              ))}
              <Button variant="outline" disabled={busy || isLoading || !!error || commands.length >= MAX_TERMINAL_COMMANDS} onClick={() => edit()}><Plus className="size-4" />{t('customCommandsAdd')}</Button>
              {commands.length >= MAX_TERMINAL_COMMANDS && <p className="text-xs text-muted-foreground">{t('customCommandsLimit')}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TerminalCommandsBar;
