import { describe, expect, it } from 'vitest';
import { getWorkspaceTreePosition } from '@/lib/workspace-order';
import type { IWorkspace } from '@/types/terminal';

const ws = (id: string, parentWorkspaceId?: string): IWorkspace => ({ id, name: id, directories: [], parentWorkspaceId });

describe('workspace tree guides', () => {
  const workspaces = [ws('root'), ws('first', 'root'), ws('nested', 'first'), ws('last', 'root')];
  it('continues an ancestor rail through descendants until its last sibling', () => {
    expect(getWorkspaceTreePosition(workspaces, 'root')).toEqual({ rails: [], childCount: 2 });
    expect(getWorkspaceTreePosition(workspaces, 'first')).toEqual({ rails: [true], childCount: 1 });
    expect(getWorkspaceTreePosition(workspaces, 'nested')).toEqual({ rails: [true, false], childCount: 0 });
    expect(getWorkspaceTreePosition(workspaces, 'last')).toEqual({ rails: [false], childCount: 0 });
  });
  it('treats missing parents as roots and bounds malformed cycles', () => {
    expect(getWorkspaceTreePosition([ws('orphan', 'missing')], 'orphan').rails).toEqual([]);
    expect(getWorkspaceTreePosition([ws('a', 'b'), ws('b', 'a')], 'a').rails).toEqual([false]);
  });
  it('caps visual indentation without losing the immediate parent or child count', () => {
    const deep = Array.from({ length: 10 }, (_, i) => ws(String(i), i ? String(i - 1) : undefined));
    expect(getWorkspaceTreePosition(deep, '8')).toEqual({ rails: Array(6).fill(false), childCount: 1 });
  });
});
