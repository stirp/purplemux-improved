import { describe, expect, it } from 'vitest';
import { getWorkspaceVisibility } from '@/lib/workspace-order';
import type { IWorkspace } from '@/types/terminal';

const workspace = (id: string, parentWorkspaceId?: string): IWorkspace => ({
  id, name: id, directories: [], parentWorkspaceId,
});
const workspaces = [
  workspace('a'), workspace('a1', 'a'), workspace('a11', 'a1'),
  workspace('a2', 'a'), workspace('a21', 'a2'),
  workspace('b'), workspace('b1', 'b'), workspace('standalone'),
];
const visible = (activeId: string | null, items = workspaces) =>
  [...getWorkspaceVisibility(items, activeId).visibleIds];

describe('workspace automatic expansion', () => {
  it('shows only the selected root children and keeps other roots visible', () => {
    expect(visible('a')).toEqual(['a', 'a1', 'a2', 'b', 'standalone']);
    expect(visible('b')).toEqual(['a', 'b', 'b1', 'standalone']);
  });

  it('keeps the selected child, its ancestors and siblings visible, expanding its own children', () => {
    expect(visible('a1')).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'standalone']);
    expect(visible('a11')).toEqual(['a', 'a1', 'a11', 'a2', 'b', 'standalone']);
    expect(visible('a2')).toEqual(['a', 'a1', 'a2', 'a21', 'b', 'standalone']);
  });

  it('collapses all children when selecting a standalone workspace or without a valid selection', () => {
    for (const id of ['standalone', 'deleted', null]) {
      expect(visible(id)).toEqual(['a', 'b', 'standalone']);
    }
  });

  it('keeps orphan workspaces accessible and does not depend on input order', () => {
    const items = [workspace('child', 'orphan'), workspace('orphan', 'missing'), workspace('root')];
    expect(visible(null, items)).toEqual(['orphan', 'root']);
    expect(visible('orphan', items)).toEqual(['child', 'orphan', 'root']);
  });

  it('identifies branch indicators without mutating the full workspace list', () => {
    const before = structuredClone(workspaces);
    const state = getWorkspaceVisibility(workspaces, 'a1');
    expect([...state.expandedIds]).toEqual(['a1', 'a']);
    expect([...state.parentIds]).toEqual(['a', 'a1', 'a2', 'b']);
    expect(workspaces).toEqual(before);
  });

  it('terminates for cyclic parent links and handles empty lists', () => {
    expect(visible('a', [workspace('a', 'b'), workspace('b', 'a')])).toEqual(['a', 'b']);
    expect(visible(null, [])).toEqual([]);
  });

  it.each([null, 'other', 'missing'])('keeps cycle members accessible when selection is %s', (selected) => {
    const items = [
      workspace('descendant', 'a'), workspace('a', 'b'), workspace('b', 'c'),
      workspace('c', 'a'), workspace('self', 'self'), workspace('other'),
      workspace('other-child', 'other'),
    ];
    const expected = ['a', 'b', 'c', 'self', 'other'];
    if (selected === 'other') expected.push('other-child');
    expect(visible(selected, items)).toEqual(expected);
    expect(visible(selected, [...items].reverse())).toEqual([...expected].reverse());
  });

  it('reveals descendants of cycles only when their branch is selected', () => {
    const items = [
      workspace('a', 'b'), workspace('b', 'a'), workspace('child', 'a'),
      workspace('grandchild', 'child'), workspace('x', 'y'), workspace('y', 'x'),
    ];
    expect(visible(null, items)).toEqual(['a', 'b', 'x', 'y']);
    expect(visible('a', items)).toEqual(['a', 'b', 'child', 'x', 'y']);
    expect(visible('child', items)).toEqual(['a', 'b', 'child', 'grandchild', 'x', 'y']);
  });
});
