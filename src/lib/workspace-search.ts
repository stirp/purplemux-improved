import type { IWorkspace } from '@/types/terminal';

export const searchWorkspaces = (workspaces: IWorkspace[], query: string) => {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return null;

  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const visibleIds = new Set<string>();
  const expandedIds = new Set<string>();
  for (const workspace of workspaces) {
    const values = [workspace.name, ...workspace.directories, workspace.worktree?.branch ?? ''];
    if (!values.some((value) => value.toLocaleLowerCase().includes(term))) continue;
    visibleIds.add(workspace.id);
    const seen = new Set([workspace.id]);
    let parentId = workspace.parentWorkspaceId;
    while (parentId && !seen.has(parentId)) {
      const parent = byId.get(parentId);
      if (!parent) break;
      seen.add(parentId);
      visibleIds.add(parentId);
      expandedIds.add(parentId);
      parentId = parent.parentWorkspaceId;
    }
  }
  return { visibleIds, expandedIds };
};
