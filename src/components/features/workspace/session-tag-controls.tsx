import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Pencil, Plus, Settings2, Tag, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverDescription, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import useIsMobile from '@/hooks/use-is-mobile';
import { cn } from '@/lib/utils';
import type { ISessionTag, TTagColor, TTagErrorCode } from '@/lib/session-tags';

export const tagColors: Record<TTagColor, string> = {
  purple: 'bg-ui-purple/15 text-ui-purple', coral: 'bg-ui-coral/15 text-ui-coral',
  pink: 'bg-ui-pink/15 text-ui-pink', gray: 'bg-ui-gray/15 text-muted-foreground',
};
export const tagButtonClass = 'h-auto min-h-11 md:min-h-8';

export const TagChip = ({ tag, onClick }: { tag: ISessionTag; onClick: () => void }) => {
  const t = useTranslations('notification.tags');
  return <Button type="button" variant="ghost" size="xs" className={cn(tagButtonClass, 'max-w-full gap-1 whitespace-normal px-2 py-1 text-left text-xs', tagColors[tag.color])}
    aria-label={t('filterBy', { name: tag.name })} onClick={onClick}>
    <Tag className="size-3" /><span className="min-w-0 [overflow-wrap:anywhere]">{tag.name}</span>
  </Button>;
};

export const SessionTagChips = ({ tags, onFilter, onEdit, title }: {
  tags: ISessionTag[]; onFilter: (id: string) => void; onEdit: () => void; title: string;
}) => {
  const t = useTranslations('notification.tags');
  return <div className="flex min-w-0 flex-wrap items-center gap-1 px-3 pb-2" data-session-tags>
    {tags.slice(0, 2).map((tag) => <TagChip key={tag.id} tag={tag} onClick={() => onFilter(tag.id)} />)}
    {tags.length > 2 && <Button type="button" variant="ghost" size="xs" className={tagButtonClass}
      aria-label={t('showAll', { count: tags.length })} onClick={onEdit}>+{tags.length - 2}</Button>}
    {!tags.length && <Button type="button" variant="ghost" size="xs" className={cn(tagButtonClass, 'text-muted-foreground')} onClick={onEdit}><Plus className="size-3" />{t('add')}</Button>}
    <Button type="button" variant="ghost" size="icon-sm" className="ml-auto size-11 text-muted-foreground md:size-8"
      aria-label={t('editSession', { title })} onClick={onEdit}><Pencil className="size-3.5" /></Button>
  </div>;
};

export const TagModal = ({ title, description, saving = false, onClose, children }: {
  title: string; description: string; saving?: boolean; onClose: () => void; children: ReactNode;
}) => {
  const t = useTranslations('notification.tags');
  return <Dialog open onOpenChange={(open, details) => { if (saving) details.cancel(); else if (!open) onClose(); }}>
    <DialogContent showCloseButton={false} className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 max-md:top-auto max-md:bottom-0 max-md:w-full max-md:max-w-full max-md:translate-y-0 max-md:rounded-b-none md:max-w-md">
      <div className="shrink-0 px-5 pt-4 pb-3">
        <div className="flex items-center gap-2"><DialogTitle className="min-w-0 flex-1 leading-normal [overflow-wrap:anywhere]">{title}</DialogTitle>
          <Button type="button" variant="ghost" size="icon-sm" className="size-11 md:size-8" disabled={saving} aria-label={t('close')} onClick={onClose}><X /></Button></div>
        <DialogDescription className="text-xs [overflow-wrap:anywhere]">{description}</DialogDescription>
      </div>
      {children}
    </DialogContent>
  </Dialog>;
};

export const TagError = ({ error }: { error: TTagErrorCode | null }) => {
  const t = useTranslations('notification.tags');
  return error ? <p role="alert" className="shrink-0 px-5 py-2 text-xs text-destructive">{t(`error_${error}`)}</p> : null;
};

export const TagOptions = ({ tags, selected, onToggle, disabled, counts }: {
  tags: ISessionTag[]; selected: string[]; onToggle: (id: string) => void; disabled?: boolean; counts?: Record<string, number>;
}) => {
  const id = useId();
  return tags.map((tag) => <label key={tag.id} htmlFor={`${id}-${tag.id}`} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted">
    <input id={`${id}-${tag.id}`} type="checkbox" checked={selected.includes(tag.id)} disabled={disabled}
      className="size-4 shrink-0 accent-[var(--ui-purple)]" onChange={() => onToggle(tag.id)} />
    <span className={cn('rounded px-1.5 py-0.5 text-xs [overflow-wrap:anywhere]', tagColors[tag.color])}>{tag.name}</span>
    {counts && <span className="ml-auto text-xs text-muted-foreground">{counts[tag.id] ?? 0}</span>}
  </label>);
};

export const SessionTagToolbar = ({ tags, selected, onChange, onManage, counts }: {
  tags: ISessionTag[]; selected: string[]; onChange: (ids: string[]) => void; onManage: () => void; counts: Record<string, number>;
}) => {
  const t = useTranslations('notification.tags');
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  const options = tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  const content = <>
    <div className="shrink-0 px-3 pb-2"><Input aria-label={t('search')} placeholder={t('search')} value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 text-base md:min-h-8 md:text-sm" /></div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2 md:max-h-72">
      <TagOptions tags={options} selected={selected} onToggle={toggle} counts={counts} />
      {!options.length && <p className="px-2 py-4 text-sm text-muted-foreground">{t(tags.length ? 'noTagsFound' : 'empty')}</p>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-3">
      <Button variant="ghost" size="sm" className={cn(tagButtonClass, 'mr-auto text-xs')} onClick={() => { setOpen(false); onManage(); }}><Settings2 className="size-4" />{t('manage')}</Button>
      <Button variant="ghost" size="sm" className={tagButtonClass} onClick={() => onChange([])}>{t('clear')}</Button>
      <Button variant="outline" size="sm" className={tagButtonClass} onClick={() => setOpen(false)}>{t('done')}</Button>
    </div>
  </>;
  const trigger = <Button type="button" variant="outline" size="sm" className={cn(tagButtonClass, 'gap-1 text-xs')} aria-label={t('filter')} aria-haspopup="dialog" aria-expanded={open}
    onClick={mobile ? () => { setQuery(''); setOpen(true); } : undefined}><Tag className="size-3.5" />{t('label')}{selected.length > 0 && <span className="text-ui-purple">{selected.length}</span>}<ChevronDown className="size-3" /></Button>;
  return <div className="mt-2 space-y-1.5">
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        <Button variant="ghost" size="sm" className={cn(tagButtonClass, 'text-xs', !selected.length && 'bg-ui-purple/10 text-ui-purple')} aria-pressed={!selected.length} onClick={() => onChange([])}>{t('all')}</Button>
        {tags.slice(0, 2).map((tag) => <Button key={tag.id} variant="ghost" size="sm" className={cn(tagButtonClass, 'text-xs', selected.includes(tag.id) && 'bg-ui-purple/10 text-ui-purple')}
          aria-pressed={selected.includes(tag.id)} onClick={() => onChange(selected.length === 1 && selected[0] === tag.id ? [] : [tag.id])}>{tag.name}</Button>)}
      </div>
      {mobile ? trigger : <Popover open={open} onOpenChange={(value) => { setOpen(value); if (value) setQuery(''); }}>
        <PopoverTrigger render={trigger} />
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] gap-0 p-0 shadow-none">
          <div className="px-3 pt-3 pb-2"><PopoverTitle>{t('filter')}</PopoverTitle><PopoverDescription className="mt-1 text-xs">{t('matchAll')}</PopoverDescription></div>{content}
        </PopoverContent>
      </Popover>}
    </div>
    {selected.length > 0 && <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      {selected.length > 1 && <span>{t('matchAllShort')}</span>}
      {selected.filter((id) => selected.length > 1 || !tags.slice(0, 2).some((tag) => tag.id === id)).map((id) => <Button key={id} variant="outline" size="xs" className={cn(tagButtonClass, 'max-w-full whitespace-normal text-left')}
        aria-label={t('removeFilter', { name: tags.find((tag) => tag.id === id)?.name ?? '' })} onClick={() => onChange(selected.filter((value) => value !== id))}>
        <span className="min-w-0 [overflow-wrap:anywhere]">{tags.find((tag) => tag.id === id)?.name}</span><X className="size-3" />
      </Button>)}
    </div>}
    {mobile && open && <TagModal title={t('filter')} description={t('matchAll')} onClose={() => setOpen(false)}>{content}</TagModal>}
  </div>;
};
