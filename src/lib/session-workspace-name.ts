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
