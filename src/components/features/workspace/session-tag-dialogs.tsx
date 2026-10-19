import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { nanoid } from 'nanoid';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSessionTagMutation } from '@/hooks/use-session-tags';
import { MAX_SESSION_TAGS, MAX_TAGS, TAG_COLORS, tagFormSchema, tagNameSchema, type ISessionTag } from '@/lib/session-tags';
import type { ISessionWorkflow } from '@/lib/session-workflow';
import { cn } from '@/lib/utils';
import { restrictToVerticalAxis } from '@/lib/dnd-modifiers';
import { TagError, TagModal, TagOptions, tagButtonClass, tagColors } from '@/components/features/workspace/session-tag-controls';
import { SortableTagRow } from '@/components/features/workspace/sortable-tag-row';

interface ITagOrderDraft { tags: ISessionTag[]; revision: number }

export interface ITagEditorSession {
  key: string;
  title: string;
  ids: string[];
  revision: number;
}

export const SessionTagEditor = ({ session, workflow, onClose, onSaved }: {
  session: ITagEditorSession; workflow: ISessionWorkflow; onClose: () => void; onSaved: (ids: string[]) => void;
}) => {
  const t = useTranslations('notification.tags');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(session.ids);
  const [created, setCreated] = useState<ISessionTag[]>([]);
  const { save, saving, error } = useSessionTagMutation();
  const tags = [...(workflow.tags ?? []), ...created];
  const name = query.trim();
  const validName = tagNameSchema.safeParse(name).success;
  const exists = tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase());
  const filtered = tags.filter((tag) => tag.name.toLowerCase().includes(name.toLowerCase()));
  const conflict = session.revision !== (workflow.tagsRevision ?? 0);
  const limit = selected.length >= MAX_SESSION_TAGS;
  const toggle = (id: string) => setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : ids.length < MAX_SESSION_TAGS ? [...ids, id] : ids);
  const submit = async () => {
    if (await save({ action: 'assign', revision: session.revision, key: session.key, tagIds: selected, newTags: created.filter((tag) => selected.includes(tag.id)) })) onSaved(selected);
  };
  return <TagModal title={t('edit')} description={session.title} saving={saving} onClose={onClose}>
    <div className="shrink-0 px-5 pb-3"><Input aria-label={t('searchOrCreate')} placeholder={t('searchOrCreate')} value={query} disabled={saving}
      className="min-h-11 text-base md:min-h-8 md:text-sm" onChange={(event) => setQuery(event.target.value)} /></div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
      <TagOptions tags={filtered} selected={selected} onToggle={toggle} disabled={saving} />
      {validName && !exists && <Button type="button" variant="ghost" className={cn(tagButtonClass, 'w-full justify-start whitespace-normal text-left text-ui-purple')} disabled={saving || limit || tags.length >= MAX_TAGS}
        onClick={() => { const tag: ISessionTag = { id: nanoid(), name, color: 'purple' }; setCreated((items) => [...items, tag]); setSelected((ids) => [...ids, tag.id]); setQuery(''); }}>
        <Plus className="size-4" /><span className="min-w-0 [overflow-wrap:anywhere]">{t('createNamed', { name })}</span>
      </Button>}
      {!filtered.length && (!validName || exists) && <p className="px-2 py-4 text-sm text-muted-foreground">{t(tags.length ? 'noTagsFound' : 'createHint')}</p>}
      {!!name && !validName && <p className="px-2 py-2 text-xs text-destructive">{t('nameInvalid')}</p>}
      {limit && <p className="px-2 py-2 text-xs text-muted-foreground">{t('error_limit')}</p>}
    </div>
    <TagError error={error ?? (conflict ? 'conflict' : null)} />
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-5 py-4">
      <span className="mr-auto text-xs text-muted-foreground">{t('selected', { count: selected.length })}</span>
      <Button variant="outline" className={tagButtonClass} disabled={saving} onClick={onClose}>{t('cancel')}</Button>
      <Button className={tagButtonClass} disabled={saving || conflict} onClick={() => void submit()}>{t(saving ? 'saving' : error ? 'retry' : 'save')}</Button>
    </div>
  </TagModal>;
};

const TagForm = ({ tag, revision, workflow, onClose, onSaved }: {
  tag?: ISessionTag; revision: number; workflow: ISessionWorkflow; onClose: () => void; onSaved: () => void;
}) => {
  const t = useTranslations('notification.tags');
  const formId = useId();
  const [id] = useState(() => tag?.id ?? nanoid());
  const { save, saving, error } = useSessionTagMutation();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<Omit<ISessionTag, 'id'>>({
    resolver: zodResolver(tagFormSchema), defaultValues: tag ?? { name: '', color: 'purple' },
  });
  const conflict = revision !== (workflow.tagsRevision ?? 0);
  const submit = handleSubmit(async (value) => {
    if (workflow.tags?.some((item) => item.id !== id && item.name.toLowerCase() === value.name.toLowerCase())) {
      setError('name', { type: 'duplicate', message: t('error_duplicate') });
      return;
    }
    if (await save({ action: tag ? 'update' : 'create', revision, tag: { ...value, id } })) { toast.success(t('saved')); onSaved(); }
  });
  return <TagModal title={t(tag ? 'editInfo' : 'create')} description={t('nameHint')} saving={saving} onClose={onClose}>
    <form onSubmit={submit} className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-y-auto px-5 pb-5">
        <fieldset disabled={saving} className="min-w-0 space-y-4">
          <div className="space-y-2"><label className="text-sm" htmlFor={`${formId}-name`}>{t('name')}</label>
            <Input id={`${formId}-name`} {...register('name')} className="min-h-11 text-base md:min-h-8 md:text-sm" aria-invalid={!!errors.name} aria-describedby={errors.name ? `${formId}-error` : undefined} />
            {errors.name && <p id={`${formId}-error`} role="alert" className="text-xs text-destructive">{errors.name.type === 'duplicate' ? errors.name.message : t('nameInvalid')}</p>}
          </div>
          <fieldset><legend className="mb-2 text-sm">{t('color')}</legend><div className="flex flex-wrap gap-2">
            {TAG_COLORS.map((color) => <label key={color} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-xs md:min-h-8', tagColors[color])}>
              <input type="radio" value={color} {...register('color')} className="accent-[var(--ui-purple)]" />{t(`color_${color}`)}
            </label>)}
          </div></fieldset>
        </fieldset>
      </div>
      <TagError error={error ?? (conflict ? 'conflict' : null)} />
      <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4"><Button type="button" variant="outline" className={tagButtonClass} disabled={saving} onClick={onClose}>{t('cancel')}</Button>
        <Button type="submit" className={tagButtonClass} disabled={saving || conflict}>{t(saving ? 'saving' : 'save')}</Button></div>
    </form>
  </TagModal>;
};

const DeleteTag = ({ tag, revision, count, workflow, onClose, onDeleted }: {
  tag: ISessionTag; revision: number; count: number; workflow: ISessionWorkflow; onClose: () => void; onDeleted: () => void;
}) => {
  const t = useTranslations('notification.tags');
  const { save, saving, error } = useSessionTagMutation();
  const conflict = revision !== (workflow.tagsRevision ?? 0);
  return <TagModal title={t('deleteNamed', { name: tag.name })} description={t('deleteHint', { count })} saving={saving} onClose={onClose}>
    <TagError error={error ?? (conflict ? 'conflict' : null)} />
    <div className="flex shrink-0 justify-end gap-2 border-t px-5 py-4"><Button variant="outline" className={tagButtonClass} disabled={saving} onClick={onClose}>{t('cancel')}</Button>
      <Button variant="destructive" className={tagButtonClass} disabled={saving || conflict} onClick={async () => {
        if (await save({ action: 'delete', revision, id: tag.id })) { toast.success(t('deleted')); onDeleted(); }
      }}>{t(saving ? 'saving' : 'delete')}</Button></div>
  </TagModal>;
};

export const SessionTagManager = ({ workflow, counts, onClose }: {
  workflow: ISessionWorkflow; counts: Record<string, number>; onClose: () => void;
}) => {
  const t = useTranslations('notification.tags');
  const [query, setQuery] = useState('');
  const [action, setAction] = useState<{ mode: 'edit' | 'delete'; tag?: ISessionTag; revision: number } | null>(null);
  const [draft, setDraft] = useState<ITagOrderDraft | null>(null);
  const [dragSnapshot, setDragSnapshot] = useState<ITagOrderDraft | null>(null);
  const { save, saving, error, resetError } = useSessionTagMutation();
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const tags = dragSnapshot?.tags ?? draft?.tags ?? workflow.tags ?? [];
  const revision = draft?.revision ?? workflow.tagsRevision ?? 0;
  const conflict = !!draft && (draft.revision !== (workflow.tagsRevision ?? 0) || error === 'conflict');
  const busy = saving || !!dragSnapshot;
  const editDisabled = busy || !!draft;
  const sortDisabled = saving || conflict || !!query.trim() || tags.length < 2;
  const finishDrag = ({ active, over }: DragEndEvent) => {
    setDragSnapshot(null);
    if (!dragSnapshot || !over || active.id === over.id) return;
    const from = dragSnapshot.tags.findIndex((tag) => tag.id === active.id);
    const to = dragSnapshot.tags.findIndex((tag) => tag.id === over.id);
    if (from < 0 || to < 0) return;
    resetError();
    setDraft({ tags: arrayMove(dragSnapshot.tags, from, to), revision: dragSnapshot.revision });
  };
  const saveOrder = async () => {
    if (!draft || conflict) return;
    if (await save({ action: 'reorder', revision: draft.revision, tagIds: draft.tags.map((tag) => tag.id) })) {
      setDraft(null);
      toast.success(t('orderSaved'));
    }
  };
  if (action?.mode === 'edit') return <TagForm tag={action.tag} revision={action.revision} workflow={workflow} onClose={() => setAction(null)} onSaved={() => setAction(null)} />;
  if (action?.mode === 'delete' && action.tag) return <DeleteTag tag={action.tag} revision={action.revision} count={counts[action.tag.id] ?? 0} workflow={workflow} onClose={() => setAction(null)} onDeleted={() => setAction(null)} />;
  const filtered = tags.filter((tag) => tag.name.toLowerCase().includes(query.trim().toLowerCase()));
  return <TagModal title={t('manage')} description={t(query.trim() ? 'sortSearchHint' : 'sortHint')} saving={saving} dragging={!!dragSnapshot} onClose={onClose}>
    <div className="flex shrink-0 flex-wrap items-center gap-2 px-5 pb-3">
      <Input aria-label={t('search')} placeholder={t('search')} value={query} disabled={busy} className="min-h-11 min-w-0 flex-1 basis-36 text-base md:min-h-8 md:text-sm" onChange={(event) => setQuery(event.target.value)} />
      <Button variant="outline" className={tagButtonClass} disabled={editDisabled || tags.length >= MAX_TAGS} onClick={() => setAction({ mode: 'edit', revision: workflow.tagsRevision ?? 0 })}><Plus className="size-4" />{t('create')}</Button>
    </div>
    <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]}
      accessibility={{ screenReaderInstructions: { draggable: t('sortInstructions') } }}
      onDragStart={() => setDragSnapshot({ tags, revision })} onDragEnd={finishDrag} onDragCancel={() => setDragSnapshot(null)}>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
        {!filtered.length && <p className="py-4 text-sm text-muted-foreground">{t(tags.length ? 'noTagsFound' : 'empty')}</p>}
        <SortableContext items={filtered.map((tag) => tag.id)} strategy={verticalListSortingStrategy}>
          {filtered.map((tag) => <SortableTagRow key={tag.id} id={tag.id} label={t('reorder', { name: tag.name })} disabled={sortDisabled}>
            <Button variant="ghost" disabled={editDisabled} className={cn(tagButtonClass, 'min-w-0 flex-1 justify-start whitespace-normal px-2 text-left')} aria-label={t('rename', { name: tag.name })} onClick={() => setAction({ mode: 'edit', tag, revision: workflow.tagsRevision ?? 0 })}>
              <span className="min-w-0 flex-1"><span className={cn('inline-block rounded px-2 py-1 text-xs [overflow-wrap:anywhere]', tagColors[tag.color])}>{tag.name}</span><span className="mt-1 block text-xs text-muted-foreground">{t('usage', { count: counts[tag.id] ?? 0 })}</span></span>
              <Pencil className="size-4 shrink-0 text-muted-foreground" />
            </Button>
            <Button variant="ghost" size="icon-sm" disabled={editDisabled} className="size-11 shrink-0 text-muted-foreground md:size-8" aria-label={t('deleteNamed', { name: tag.name })} onClick={() => setAction({ mode: 'delete', tag, revision: workflow.tagsRevision ?? 0 })}><Trash2 className="size-4" /></Button>
          </SortableTagRow>)}
        </SortableContext>
      </div>
    </DndContext>
    <TagError error={draft ? !saving && conflict ? 'conflict' : error : null} />
    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t px-5 py-4">
      {draft ? <>
        <Button variant="outline" className={tagButtonClass} disabled={busy} onClick={() => { setDraft(null); resetError(); }}>{t('cancelOrder')}</Button>
        <Button className={tagButtonClass} disabled={busy || conflict} onClick={() => void saveOrder()}>{t(saving ? 'saving' : error ? 'retry' : 'saveOrder')}</Button>
      </> : <Button variant="outline" className={tagButtonClass} disabled={busy} onClick={onClose}>{t('done')}</Button>}
    </div>
  </TagModal>;
};
