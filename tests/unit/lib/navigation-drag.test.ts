import { describe, expect, it } from 'vitest';
import { canDropNavigationItem, reorderNavigationIds } from '@/hooks/use-navigation-drag';

describe('mobile navigation ordering', () => {
  it('moves a row before or after the target in either direction', () => {
    expect(reorderNavigationIds(['a', 'b', 'c'], 'a', 'c', true)).toEqual(['b', 'c', 'a']);
    expect(reorderNavigationIds(['a', 'b', 'c'], 'a', 'c', false)).toEqual(['b', 'a', 'c']);
    expect(reorderNavigationIds(['a', 'b', 'c'], 'c', 'a', false)).toEqual(['c', 'a', 'b']);
    expect(reorderNavigationIds(['a', 'b', 'c'], 'c', 'a', true)).toEqual(['a', 'c', 'b']);
  });

  it('ignores self drops and stale row IDs', () => {
    const ids = ['a', 'b'];
    expect(reorderNavigationIds(ids, 'a', 'a', true)).toBe(ids);
    expect(reorderNavigationIds(ids, 'missing', 'b', true)).toBe(ids);
    expect(reorderNavigationIds(ids, 'a', 'missing', true)).toBe(ids);
  });

  it('does not submit a tab reorder against another workspace or pane', () => {
    const source = { kind: 'tab' as const, id: 'a', workspaceId: 'ws-a', paneId: 'pane-a' };
    expect(canDropNavigationItem(source, { ...source, id: 'b' })).toBe(true);
    expect(canDropNavigationItem(source, { ...source, id: 'b', workspaceId: 'ws-b' })).toBe(false);
    expect(canDropNavigationItem(source, { ...source, id: 'b', paneId: 'pane-b' })).toBe(false);
    expect(canDropNavigationItem(source, { kind: 'workspace', id: 'ws-a' })).toBe(false);
  });
});
