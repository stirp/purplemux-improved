import { z } from 'zod';
import type { ISessionWorkflow, IWorkSession } from '@/lib/session-workflow';

export const TAG_COLORS = ['purple', 'coral', 'pink', 'gray', 'blue', 'teal', 'amber', 'green', 'red'] as const;
export const MAX_SESSION_TAGS = 100;
export const MAX_TAGS = 500;
export const tagNameSchema = z.string().trim().min(1).refine((name) => [...name].length <= 24);
export const tagFormSchema = z.object({ name: tagNameSchema, color: z.enum(TAG_COLORS) });
const tagIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/).refine((id) => !Object.hasOwn(Object.prototype, id));
export const sessionTagSchema = tagFormSchema.extend({ id: tagIdSchema }).strict();
export type TTagColor = typeof TAG_COLORS[number];
export interface ISessionTag { id: string; name: string; color: TTagColor }
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
export const sessionTagUpdateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign'), revision,
    key: z.string().regex(/^(claude|codex):[a-zA-Z0-9_:-]{1,256}$/),
    tagIds: z.array(tagIdSchema).max(MAX_SESSION_TAGS),
    newTags: z.array(sessionTagSchema).max(MAX_SESSION_TAGS),
  }).strict(),
  z.object({ action: z.literal('create'), revision, tag: sessionTagSchema }).strict(),
  z.object({ action: z.literal('update'), revision, tag: sessionTagSchema }).strict(),
  z.object({ action: z.literal('delete'), revision, id: tagIdSchema }).strict(),
  z.object({ action: z.literal('reorder'), revision, tagIds: z.array(tagIdSchema).max(MAX_TAGS) }).strict(),
]);
export type TSessionTagUpdate = z.infer<typeof sessionTagUpdateSchema>;
export type TTagErrorCode = 'conflict' | 'duplicate' | 'missing' | 'limit' | 'invalid' | 'saveFailed';

export class SessionTagError extends Error {
  constructor(public readonly code: TTagErrorCode, public readonly status = 409) {
    super(code);
  }
}

export const sessionTagIds = (workflow: ISessionWorkflow, session: IWorkSession): string[] => {
  if (workflow.deleted?.includes(session.key)) return [];
  const fallback = `${session.key.split(':')[0]}:tab:${session.tabId}`;
  const temporary = session.live?.agentSessionId && !workflow.tabBindings?.[fallback]
    ? workflow.sessionTags?.[fallback] ?? [] : [];
  const known = new Set(workflow.tags?.map((tag) => tag.id));
  return [...new Set([...(workflow.sessionTags?.[session.key] ?? []), ...temporary])].filter((id) => known.has(id));
};

export const forgetSessionTags = (workflow: ISessionWorkflow, key: string): void => {
  if (workflow.sessionTags?.[key]) {
    delete workflow.sessionTags[key];
    workflow.tagsRevision = (workflow.tagsRevision ?? 0) + 1;
  }
};

export const applySessionTagUpdate = (workflow: ISessionWorkflow, update: TSessionTagUpdate): ISessionWorkflow => {
  if (update.revision !== (workflow.tagsRevision ?? 0)) throw new SessionTagError('conflict');
  let tags = [...(workflow.tags ?? [])];
  const sessionTags = { ...workflow.sessionTags };
  const add = (tag: ISessionTag) => {
    if (tags.some((item) => item.id === tag.id || item.name.toLowerCase() === tag.name.toLowerCase())) {
      throw new SessionTagError('duplicate');
    }
    if (tags.length >= MAX_TAGS) throw new SessionTagError('limit');
    tags.push(tag);
  };
  if (update.action === 'assign') {
    if (workflow.deleted?.includes(update.key) || !workflow.sessions?.[update.key]) throw new SessionTagError('missing', 404);
    if (update.newTags.some((tag) => !update.tagIds.includes(tag.id))) throw new SessionTagError('invalid', 400);
    update.newTags.forEach(add);
    if (update.tagIds.some((id) => !tags.some((tag) => tag.id === id))) throw new SessionTagError('missing');
    if (update.tagIds.length) sessionTags[update.key] = [...new Set(update.tagIds)];
    else delete sessionTags[update.key];
  } else if (update.action === 'create') add(update.tag);
  else if (update.action === 'update') {
    const index = tags.findIndex((tag) => tag.id === update.tag.id);
    if (index < 0) throw new SessionTagError('missing', 404);
    if (tags.some((tag) => tag.id !== update.tag.id && tag.name.toLowerCase() === update.tag.name.toLowerCase())) throw new SessionTagError('duplicate');
    tags[index] = update.tag;
  } else if (update.action === 'reorder') {
    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    if (update.tagIds.length !== tags.length || new Set(update.tagIds).size !== tags.length
      || update.tagIds.some((id) => !byId.has(id))) throw new SessionTagError('invalid', 400);
    tags = update.tagIds.map((id) => byId.get(id)!);
  } else {
    if (!tags.some((tag) => tag.id === update.id)) throw new SessionTagError('missing', 404);
    tags = tags.filter((tag) => tag.id !== update.id);
    for (const [key, ids] of Object.entries(sessionTags)) {
      const remaining = ids.filter((id) => id !== update.id);
      if (remaining.length) sessionTags[key] = remaining;
      else delete sessionTags[key];
    }
  }
  return { ...workflow, tags, sessionTags, tagsRevision: (workflow.tagsRevision ?? 0) + 1 };
};
