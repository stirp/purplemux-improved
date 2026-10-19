import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Plus, Settings2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import useTerminalCommands from '@/hooks/use-terminal-commands';
import { restrictToVerticalAxis } from '@/lib/dnd-modifiers';
import { MAX_TERMINAL_COMMANDS, terminalCommandInput, terminalCommandSchema, type ITerminalCommand } from '@/lib/terminal-custom-commands';

interface ITerminalCommandsBarProps {
  sendStdin: (data: string) => void;
  connected: boolean;
  children?: ReactNode;
}

interface ISortableCommandProps {
  command: ITerminalCommand;
  disabled: boolean;
  children: ReactNode;
}

const SortableCommand = ({ command, disabled, children }: ISortableCommandProps) => {
  const t = useTranslations('terminal');
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: command.id,
    disabled,
  });

  return (
    <div ref={setNodeRef} className="relative space-y-2 rounded-md border bg-background p-3 pl-12"
      style={{ transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 1 : undefined }}>
      <Button ref={setActivatorNodeRef} {...attributes} {...listeners} variant="ghost" size="icon-sm"
        className="absolute left-2 top-3 touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
        disabled={disabled} aria-label={t('customCommandsReorder', { name: command.name })}
        title={t('customCommandsReorder', { name: command.name })}>
        <GripVertical className="size-4" />
      </Button>
      {children}
    </div>
  );
};

const TerminalCommandsBar = ({ sendStdin, connected, children }: ITerminalCommandsBarProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const { commands, isLoading, error, reload, save } = useTerminalCommands();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const formId = useId();
  const { control, register, handleSubmit, reset, formState: { errors } } = useForm<Omit<ITerminalCommand, 'id'>>({
    resolver: zodResolver(terminalCommandSchema),
    defaultValues: { name: '', command: '', autoEnter: true },
  });

  const edit = (command?: ITerminalCommand) => {
    reset(command ? { name: command.name, command: command.command, autoEnter: command.autoEnter ?? true } : { name: '', command: '', autoEnter: true });
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

  const reorder = async ({ active, over }: DragEndEvent) => {
    setDragging(false);
    if (busy || error || !over || active.id === over.id) return;
    const from = commands.findIndex((command) => command.id === active.id);
    const to = commands.findIndex((command) => command.id === over.id);
    if (from === -1 || to === -1) return;
    setBusy(true);
    setDeleting(null);
    try {
      await save('PUT', { ids: arrayMove(commands, from, to).map((command) => command.id) });
    } catch {
      toast.error(t('customCommandsReorderFailed'));
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div role="toolbar" aria-label={t('customCommands')} className="flex min-w-0 shrink-0 items-center gap-2 border-t border-border bg-background px-3 py-1.5">
        <Button variant="ghost" size="icon-sm" aria-label={t('customCommandsManage')} title={t('customCommandsManage')}
          onClick={() => { setEditing(null); setDeleting(null); setOpen(true); }}>
          <Settings2 className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {commands.map((command) => (
            <Button key={command.id} variant="outline" size="sm" className="max-w-48 shrink-0 text-xs"
              title={command.command} disabled={!connected || !!error}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => { if (connected && !error) sendStdin(terminalCommandInput(command.command, command.autoEnter)); }}>
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
        {children && <div className="flex min-w-0 flex-1 items-center justify-end border-l border-border pl-2">{children}</div>}
      </div>
      <Dialog open={open} onOpenChange={(value, details) => {
        if (busy || dragging) {
          details.cancel();
          if (dragging && details.reason === 'escape-key') details.allowPropagation();
          return;
        }
        setOpen(value);
      }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg" showCloseButton={!busy}
          onKeyDown={(event) => {
            // Base UI otherwise stops arrow keys before the document-level drag sensor receives them.
            if (dragging && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) event.preventBaseUIHandler();
          }}>
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
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2" htmlFor={`${formId}-auto-enter`}>
                    <Controller name="autoEnter" control={control} render={({ field }) => (
                      <Checkbox id={`${formId}-auto-enter`} checked={field.value ?? true} onCheckedChange={field.onChange}
                        onBlur={field.onBlur} ref={field.ref} disabled={busy} aria-describedby={`${formId}-auto-enter-hint`} />
                    )} />
                    {t('customCommandsAutoEnter')}
                  </label>
                  <p id={`${formId}-auto-enter-hint`} className="text-xs text-muted-foreground">{t('customCommandsAutoEnterHint')}</p>
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
              {commands.length > 1 && <p className="text-xs text-muted-foreground">{t('customCommandsReorderHint')}</p>}
              <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]}
                onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)}
                onDragEnd={(event) => void reorder(event)}>
                <SortableContext items={commands.map((command) => command.id)} strategy={verticalListSortingStrategy}>
                  {commands.map((command) => (
                    <SortableCommand key={command.id} command={command} disabled={busy || isLoading || !!error || commands.length < 2}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-medium">{command.name}</p>
                          <p className="mt-1 whitespace-pre-wrap break-all font-mono text-xs text-muted-foreground">{command.command}</p>
                        </div>
                        <Button variant="ghost" size="icon-sm" disabled={busy || dragging || !!error} aria-label={`${tc('edit')} ${command.name}`} onClick={() => edit(command)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon-sm" disabled={busy || dragging || !!error} aria-label={`${tc('delete')} ${command.name}`} onClick={() => setDeleting(command.id)}><Trash2 className="size-3.5" /></Button>
                      </div>
                      {deleting === command.id && <div className="flex flex-wrap items-center justify-end gap-2">
                        <p className="mr-auto text-xs">{t('customCommandsDeleteConfirm')}</p>
                        <Button variant="outline" size="sm" disabled={busy || dragging} onClick={() => setDeleting(null)}>{tc('cancel')}</Button>
                        <Button variant="destructive" size="sm" disabled={busy || dragging} onClick={() => void remove(command.id)}>{tc('delete')}</Button>
                      </div>}
                    </SortableCommand>
                  ))}
                </SortableContext>
              </DndContext>
              <Button variant="outline" disabled={busy || dragging || isLoading || !!error || commands.length >= MAX_TERMINAL_COMMANDS} onClick={() => edit()}><Plus className="size-4" />{t('customCommandsAdd')}</Button>
              {commands.length >= MAX_TERMINAL_COMMANDS && <p className="text-xs text-muted-foreground">{t('customCommandsLimit')}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TerminalCommandsBar;
