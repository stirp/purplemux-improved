import { collectWorkSessions, type ISessionWorkflow, type IWorkflowTab } from '@/lib/session-workflow';
import type { ISessionHistoryEntry, TSessionNavigationTarget } from '@/types/session-history';
import type { ISessionMeta } from '@/types/timeline';
import type { ICodexSessionEntry } from '@/lib/codex-session-list';
import type { IWorkspace } from '@/types/terminal';

export interface INewTabSession {
  key: string;
  title: string;
  updatedAt: number;
  target: TSessionNavigationTarget;
}

export const mergeNewTabSessions = (
  workspace: IWorkspace,
  native: INewTabSession[],
  entries: ISessionHistoryEntry[],
  tabs: Record<string, IWorkflowTab>,
  workflow: ISessionWorkflow,
): INewTabSession[] => {
  const merged = new Map(native.map((session) => [session.key, session]));
  for (const session of collectWorkSessions(entries, tabs, workflow)) {
    if (session.workspaceId !== workspace.id) {
      merged.delete(session.key);
      continue;
    }
    if (!session.navigation?.agentSessionId) continue;
    const existing = merged.get(session.key);
    merged.set(session.key, {
      key: session.key,
      title: workflow.titles?.[session.key] || session.live?.lastUserMessage || session.entry?.prompt || existing?.title || '',
      updatedAt: Math.max(existing?.updatedAt ?? 0, session.entry?.completedAt ?? 0),
      target: { ...session.navigation, workspaceName: workspace.name,
        workspaceDir: session.navigation.workspaceDir ?? existing?.target.workspaceDir ?? null },
    });
  }
  const deleted = new Set(workflow.deleted);
  return [...merged.values()]
    .filter((session) => !deleted.has(session.key))
    .map((session) => ({ ...session, title: workflow.titles?.[session.key] || session.title }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key));
};

const readJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`request-failed-${response.status}`);
  return response.json() as Promise<T>;
};

export const loadNewTabSessions = async (workspace: IWorkspace, directories: string[]) => {
  const results = await Promise.allSettled(directories.flatMap((cwd) => {
    const target = (providerId: 'claude' | 'codex', agentSessionId: string): TSessionNavigationTarget => ({
      workspaceId: workspace.id, workspaceName: workspace.name, workspaceDir: cwd,
      tabId: '', providerId, agentSessionId,
    });
    return [
      readJson<{ sessions: ISessionMeta[] }>(`/api/timeline/sessions?cwd=${encodeURIComponent(cwd)}&all=true`)
        .then(({ sessions }) => sessions.map((session) => ({
          key: `claude:${session.sessionId}`, title: session.firstMessage || '',
          updatedAt: Date.parse(session.lastActivityAt), target: target('claude', session.sessionId),
        }))),
      readJson<{ sessions: ICodexSessionEntry[] }>(`/api/codex/sessions?cwd=${encodeURIComponent(cwd)}`)
        .then(({ sessions }) => sessions.map((session) => ({
          key: `codex:${session.sessionId}`, title: session.firstUserMessage || '',
          updatedAt: session.lastActivityAt || session.startedAt, target: target('codex', session.sessionId),
        }))),
    ];
  }));
  return {
    sessions: results.flatMap((result) => result.status === 'fulfilled' ? result.value : []),
    hasError: results.some((result) => result.status === 'rejected'),
  };
};
