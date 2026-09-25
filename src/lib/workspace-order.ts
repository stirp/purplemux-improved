import type { IWorkspace, IWorkspaceGroup } from '@/types/terminal';

export const getVisuallyOrderedWorkspaces = (
  workspaces: IWorkspace[],
  groups: IWorkspaceGroup[],
): IWorkspace[] => {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  workspaces = workspaces.map((workspace) => {
    let root = workspace;
    const seen = new Set([root.id]);
    while (root.parentWorkspaceId && byId.has(root.parentWorkspaceId) && !seen.has(root.parentWorkspaceId)) {
      root = byId.get(root.parentWorkspaceId)!;
      seen.add(root.id);
    }
    return root === workspace || root.groupId === workspace.groupId ? workspace : { ...workspace, groupId: root.groupId };
  });
  const validGroupIds = new Set(groups.map((g) => g.id));
  const byGroup = new Map<string, IWorkspace[]>();
  const ungrouped: IWorkspace[] = [];

  for (const ws of workspaces) {
    const gid = ws.groupId ?? null;
    if (gid && validGroupIds.has(gid)) {
      const list = byGroup.get(gid) ?? [];
      list.push(ws);
      byGroup.set(gid, list);
    } else {
      ungrouped.push(ws);
    }
  }

  const ordered: IWorkspace[] = [];
  for (const g of groups) {
    const list = byGroup.get(g.id);
    if (list) ordered.push(...list);
  }
  ordered.push(...ungrouped);
  const result: IWorkspace[] = [];
  const visited = new Set<string>();
  const children = new Map<string, IWorkspace[]>();
  for (const workspace of ordered) {
    if (!workspace.parentWorkspaceId || !byId.has(workspace.parentWorkspaceId)) continue;
    const list = children.get(workspace.parentWorkspaceId) ?? [];
    list.push(workspace);
    children.set(workspace.parentWorkspaceId, list);
  }
  const visit = (workspace: IWorkspace) => {
    if (visited.has(workspace.id)) return;
    visited.add(workspace.id);
    result.push(workspace);
    children.get(workspace.id)?.forEach(visit);
  };
  ordered.filter((workspace) => !workspace.parentWorkspaceId || !byId.has(workspace.parentWorkspaceId)).forEach(visit);
  ordered.forEach(visit);
  return result;
};
