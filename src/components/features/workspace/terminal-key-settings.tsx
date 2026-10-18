import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowDown, ArrowUp, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import useTerminalKeys from '@/hooks/use-terminal-keys';
import { TERMINAL_KEYS, terminalKeysSchema, type ITerminalKeySetting } from '@/lib/terminal-keys';

const schema = z.object({ keys: terminalKeysSchema });

interface IKeySettingsFormProps {
  keys: ITerminalKeySetting[];
  disabled: boolean;
  busy: boolean;
  onSave: (keys: ITerminalKeySetting[]) => Promise<void>;
  onCancel: () => void;
}

const KeySettingsForm = ({ keys, disabled, busy, onSave, onCancel }: IKeySettingsFormProps) => {
  const t = useTranslations('terminal');
  const tc = useTranslations('common');
  const { control, setValue, handleSubmit } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { keys },
  });
  const draft = useWatch({ control, name: 'keys' });
  const move = (from: number, to: number) => {
    const next = [...draft];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setValue('keys', next);
  };

  return (
    <form onSubmit={handleSubmit(({ keys }) => onSave(keys))} className="flex min-h-0 flex-col gap-4">
      <div className="min-h-0 overflow-y-auto">
        <fieldset disabled={disabled} className="min-w-0">
          {draft.map((key, index) => {
            const definition = TERMINAL_KEYS.find(({ id }) => id === key.id)!;
            const name = definition.name ?? definition.label;
            return (
              <div key={key.id} className="flex items-center gap-2 border-b border-border py-1.5">
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-2 text-sm">
                  <Checkbox checked={key.visible} disabled={disabled}
                    onCheckedChange={(visible) => setValue(`keys.${index}.visible`, visible === true)} />
                  <span>{name}</span>
                </label>
                <Button type="button" variant="ghost" size="icon-sm" className="size-9" disabled={disabled || index === 0}
                  aria-label={t('keyBarMoveUp', { name })} onClick={() => move(index, index - 1)}><ArrowUp className="size-4" /></Button>
                <Button type="button" variant="ghost" size="icon-sm" className="size-9" disabled={disabled || index === draft.length - 1}
                  aria-label={t('keyBarMoveDown', { name })} onClick={() => move(index, index + 1)}><ArrowDown className="size-4" /></Button>
              </div>
            );
          })}
        </fieldset>
      </div>
      <div className="flex shrink-0 justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{tc('cancel')}</Button>
        <Button type="submit" disabled={disabled}>{busy ? tc('loading') : tc('save')}</Button>
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

  const submit = async (keys: ITerminalKeySetting[]) => {
    if (busy || error) return;
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
        if (busy) { details.cancel(); return; }
        setOpen(value);
      }}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-sm" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{t('keyBarManage')}</DialogTitle>
            <DialogDescription>{t('keyBarDescription')}</DialogDescription>
          </DialogHeader>
          {isLoading && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}
          {error && <Button variant="outline" disabled={busy} onClick={() => void reload().catch(() => {})}>
            {t('keyBarLoadFailed')} · {tc('retry')}
          </Button>}
          {open && hasData && <KeySettingsForm keys={keys} disabled={busy || !!error} busy={busy}
            onSave={submit} onCancel={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default TerminalKeySettings;
