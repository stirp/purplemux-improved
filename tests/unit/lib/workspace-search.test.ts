import { describe, expect, it } from 'vitest';
import { searchWorkspaces } from '@/lib/workspace-search';
import type { IWorkspace } from '@/types/terminal';

const workspaces: IWorkspace[] = [
  { id: 'root', name: 'Project', directories: ['/workspace/project'] },
  { id: 'child', name: 'Sidebar polish', directories: ['/worktrees/sidebar'], parentWorkspaceId: 'root', worktree: { repository: '/workspace/project', branch: 'feat/Compact-Tree', baseCommit: 'abc' } },
  { id: 'leaf', name: 'Leaf', directories: ['/worktrees/leaf'], parentWorkspaceId: 'child' },
  { id: 'other', name: 'Other', directories: ['/workspace/other'] },
];

describe('workspace search', () => {
  it.each(['SIDEBAR', ' /worktrees/sidebar ', 'compact-tree'])('matches names, paths and branches while retaining ancestry: %s', (query) => {
    const result = searchWorkspaces(workspaces, query)!;
    expect([...result.visibleIds].sort()).toEqual(['child', 'root']);
    expect([...result.expandedIds]).toEqual(['root']);
  });

  it('reveals the entire ancestor chain of a normally hidden descendant', () => {
    const result = searchWorkspaces(workspaces, 'leaf')!;
    expect([...result.visibleIds].sort()).toEqual(['child', 'leaf', 'root']);
    expect([...result.expandedIds].sort()).toEqual(['child', 'root']);
  });

  it('returns null for a cleared search and an empty set for no matches', () => {
    expect(searchWorkspaces(workspaces, '  ')).toBeNull();
    expect(searchWorkspaces(workspaces, 'missing')!.visibleIds.size).toBe(0);
  });

  it('keeps orphans and cycles reachable without looping', () => {
    const result = searchWorkspaces([
      { id: 'a', name: 'Match', directories: [], parentWorkspaceId: 'b' },
      { id: 'b', name: 'Cycle', directories: [], parentWorkspaceId: 'a' },
      { id: 'orphan', name: 'Match', directories: [], parentWorkspaceId: 'missing' },
    ], 'match')!;
    expect([...result.visibleIds].sort()).toEqual(['a', 'b', 'orphan']);
    expect(result.visibleIds.has('missing')).toBe(false);
  });
});
