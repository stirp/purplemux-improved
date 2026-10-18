import { describe, expect, it } from 'vitest';
import { applySessionTagUpdate, sessionTagIds, sessionTagUpdateSchema, tagNameSchema } from '@/lib/session-tags';
import { collectWorkSessions, reconcileSessionWorkflow, type ISessionWorkflow } from '@/lib/session-workflow';

const tag = { id: 'resident', name: 'Resident', color: 'purple' as const };
describe('session tags', () => {
  it('supports Unicode names, trims whitespace and enforces 24 code points', () => {
    expect(tagNameSchema.parse('  常驻助手  ')).toBe('常驻助手');
    expect(tagNameSchema.safeParse('😀'.repeat(24)).success).toBe(true);
    expect(tagNameSchema.safeParse('😀'.repeat(25)).success).toBe(false);
    expect(tagNameSchema.safeParse('   ').success).toBe(false);
  });
  it('rejects invalid actions, colors, keys, revisions and extra fields', () => {
    const base = { action: 'create', revision: 0, tag };
    for (const update of [{ ...base, revision: -1 }, { ...base, extra: true }, { ...base, tag: { ...tag, color: 'red' } }, { ...base, tag: { ...tag, id: '__proto__' } },
      { action: 'assign', revision: 0, key: '__proto__', tagIds: [], newTags: [] }]) expect(sessionTagUpdateSchema.safeParse(update).success).toBe(false);
  });
  it('rejects duplicate names case insensitively without modifying input', () => {
    const workflow: ISessionWorkflow = { statuses: {}, collapsed: {}, tags: [tag], tagsRevision: 1 };
    expect(() => applySessionTagUpdate(workflow, { action: 'create', revision: 1, tag: { ...tag, id: 'second', name: 'RESIDENT' } })).toThrow('duplicate');
    expect(workflow.tags).toEqual([tag]);
  });
  it('rejects missing references and rolls back the entire draft catalog', () => {
    const workflow: ISessionWorkflow = { statuses: {}, collapsed: {}, sessions: { 'codex:A': { workspaceId: 'w', tabId: 't', status: 'review' } } };
    expect(() => applySessionTagUpdate(workflow, { action: 'assign', revision: 0, key: 'codex:A', tagIds: ['resident', 'gone'], newTags: [tag] })).toThrow('missing');
    expect(workflow.tags).toBeUndefined();
    expect(workflow.sessionTags).toBeUndefined();
  });
  it('shows first-binding temporary tags once and merges native associations', () => {
    const workflow: ISessionWorkflow = { statuses: {}, collapsed: {}, tags: [tag, { ...tag, id: 'work', name: 'Work' }], sessionTags: { 'codex:tab:t': ['resident'], 'codex:A': ['work'] }, tagsRevision: 1 };
    const tabs = { t: { workspaceId: 'w', panelType: 'codex-cli', agentSessionId: 'A' } };
    const session = collectWorkSessions([], tabs, workflow)[0];
    expect(sessionTagIds(workflow, session)).toEqual(['work', 'resident']);
    const next = reconcileSessionWorkflow(workflow, [], tabs);
    expect(next.sessionTags).toEqual({ 'codex:A': ['work', 'resident'] });
    expect(next.tagsRevision).toBe(2);
    expect(sessionTagIds(next, collectWorkSessions([], { t: { ...tabs.t, agentSessionId: 'B' } }, next).find((item) => item.key === 'codex:B')!)).toEqual([]);
  });
});
