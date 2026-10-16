import type { IWorkSession } from '@/lib/session-workflow';
import type { IWorkspace } from '@/types/terminal';

export const sessionWorkspaceName = (session: IWorkSession, workspace?: IWorkspace): string | null => {
  const sources = [session.entry, session.navigation, session.live, ...session.olderEntries];
  const name = [workspace?.name, ...sources.map((source) => source?.workspaceName)]
    .map((value) => value?.trim())
    .find((value) => value && value !== session.workspaceId);
  if (name) return name;
  const directory = [...(workspace?.directories ?? []), ...sources.map((source) => source?.workspaceDir)]
    .map((value) => value?.trim().split(/[\\/]+/).filter(Boolean).at(-1))
    .find(Boolean);
  return directory || session.workspaceId.trim() || null;
};

export const sessionRootWorkspaceName = (session: IWorkSession, workspaces: IWorkspace[]): string | null => {
  const byId = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  let root = byId.get(session.workspaceId);
  if (!root) return null;
  const seen = new Set([root.id]);
  while (root.parentWorkspaceId) {
    const parent = byId.get(root.parentWorkspaceId);
    if (!parent || seen.has(parent.id)) return null;
    seen.add(parent.id);
    root = parent;
  }
  if (root.id === session.workspaceId) return sessionWorkspaceName(session, root);
  return sessionWorkspaceName({ ...session, workspaceId: root.id, entry: undefined, navigation: undefined, live: undefined, olderEntries: [] }, root);
};
