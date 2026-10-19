import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DndContext, closestCenter, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type Modifier } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, sortableKeyboardCoordinates, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import useTerminalKeys from '@/hooks/use-terminal-keys';
import { TERMINAL_KEYS, terminalKeysSchema, type ITerminalKeySetting } from '@/lib/terminal-keys';

const schema = z.object({ keys: terminalKeysSchema });
const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 });

interface ISortableKeyProps {
  setting: ITerminalKeySetting;
  disabled: boolean;
  dragging: boolean;
  onVisibleChange: (visible: boolean) => void;
}

const SortableKey = ({ setting, disabled, dragging, onVisibleChange }: ISortableKeyProps) => {
  const t = useTranslations('terminal');
  const definition = TERMINAL_KEYS.find(({ id }) => id === setting.id)!;
  const name = definition.name ?? definition.label;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: setting.id,
    disabled,
  });

  return (
    <div ref={setNodeRef} data-key-id={setting.id}
      className={`relative flex items-center gap-2 border-b border-border bg-background py-1.5 ${isDragging ? 'z-10 rounded-md shadow-md ring-1 ring-primary/30' : ''}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}>
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-sm">
        <Checkbox checked={setting.visible} disabled={disabled || dragging}
          onCheckedChange={(visible) => onVisibleChange(visible === true)} />
        <span>{name}</span>
      </label>
      <Button ref={setActivatorNodeRef} {...attributes} {...listeners} type="button" variant="ghost" size="icon-sm"
        className="size-11 shrink-0 touch-pan-y select-none cursor-grab text-muted-foreground active:cursor-grabbing"
        style={{ WebkitTouchCallout: 'none' }} onContextMenu={(event) => event.preventDefault()}
        disabled={disabled} aria-label={t('keyBarReorder', { name })} title={t('keyBarReorder', { name })}>
        <GripVertical className="size-4" />
      </Button>
    </div>
  );
};

interface IKeySettingsFormProps {
  keys: ITerminalKeySetting[];
  disabled: boolean;
  busy: boolean;
  dragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onSave: (keys: ITerminalKeySetting[]) => Promise<void>;
  onCancel: () => void;
}

const KeySettingsForm = ({ keys, disabled, busy, dragging, onDraggingChange, onSave, onCancel }: IKeySettingsFormProps) => {
  const tc = useTranslations('common');
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 350, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { control, setValue, handleSubmit } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { keys },
  });
  const draft = useWatch({ control, name: 'keys' });
  const reorder = ({ active, over }: DragEndEvent) => {
    onDraggingChange(false);
    if (disabled || !over || active.id === over.id) return;
    const from = draft.findIndex(({ id }) => id === active.id);
    const to = draft.findIndex(({ id }) => id === over.id);
    if (from !== -1 && to !== -1) setValue('keys', arrayMove(draft, from, to));
  };

  return (
    <form onSubmit={handleSubmit(({ keys }) => { if (!disabled && !dragging) return onSave(keys); })} className="flex min-h-0 flex-col gap-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]}
        onDragStart={() => onDraggingChange(true)} onDragCancel={() => onDraggingChange(false)} onDragEnd={reorder}>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <SortableContext items={draft.map(({ id }) => id)} strategy={verticalListSortingStrategy}>
            {draft.map((key, index) => (
              <SortableKey key={key.id} setting={key} disabled={disabled} dragging={dragging}
                onVisibleChange={(visible) => setValue(`keys.${index}.visible`, visible)} />
            ))}
          </SortableContext>
        </div>
      </DndContext>
      <div className="flex shrink-0 justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy || dragging} onClick={onCancel}>{tc('cancel')}</Button>
        <Button type="submit" disabled={disabled || dragging}>{busy ? tc('loading') : tc('save')}</Button>
      </div>
    </form>
  );
};

const TerminalKeySettings = () => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const { keys, hasData, error, isLoading, reload, save } = useTerminalKeys();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const submit = async (keys: ITerminalKeySetting[]) => {
    if (busy || error || dragging) return;
    setBusy(true);
    try {
      await save(keys);
      setOpen(false);
      toast.success(tc('saved'));
    } catch {
      toast.error(t('keyBarSaveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon-sm" className="shrink-0" aria-label={t('keyBarManage')}
        title={t('keyBarManage')} onClick={() => setOpen(true)}><Settings2 className="size-4" /></Button>
      <Dialog open={open} onOpenChange={(value, details) => {
        if (busy || dragging) {
          details.cancel();
          if (dragging && details.reason === 'escape-key') details.allowPropagation();
          return;
        }
        setOpen(value);
      }}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-sm" showCloseButton={!busy && !dragging}
          onKeyDown={(event) => {
            // Base UI otherwise stops arrow keys before the document-level drag sensor receives them.
            if (dragging && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) event.preventBaseUIHandler();
          }}>
          <DialogHeader>
            <DialogTitle>{t('keyBarManage')}</DialogTitle>
            <DialogDescription>{t('keyBarDescription')}</DialogDescription>
          </DialogHeader>
          {isLoading && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}
          {error && <Button variant="outline" disabled={busy} onClick={() => void reload().catch(() => {})}>
            {t('keyBarLoadFailed')} · {tc('retry')}
          </Button>}
          {open && hasData && <KeySettingsForm keys={keys} disabled={busy || !!error} busy={busy}
            dragging={dragging} onDraggingChange={setDragging}
            onSave={submit} onCancel={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TerminalKeySettings;
