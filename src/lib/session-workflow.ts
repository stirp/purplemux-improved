import type { ISessionHistoryEntry, TSessionNavigationTarget } from '@/types/session-history';
import type { TCliState } from '@/types/timeline';

export const WORK_STATUSES = ['pending', 'in-progress', 'review', 'completed'] as const;
export type TWorkStatus = typeof WORK_STATUSES[number];
export interface ISessionWorkflow {
  statuses: Record<string, TWorkStatus>;
  collapsed: Partial<Record<TWorkStatus, boolean>>;
  sessions?: Record<string, IWorkflowSessionRecord>;
  tabBindings?: Record<string, string>;
  deleted?: string[];
}
export interface IWorkflowSessionRecord {
  workspaceId: string;
  tabId: string;
  status: TWorkStatus;
  entry?: ISessionHistoryEntry;
  navigation?: TSessionNavigationTarget;
}
export interface IWorkflowTab {
  workspaceId: string;
  workspaceName?: string;
  workspaceDir?: string | null;
  panelType?: string;
  agentProviderId?: string;
  agentSessionId?: string | null;
  cliState?: TCliState;
  lastUserMessage?: string | null;
}
export interface IWorkSession {
  key: string;
  workspaceId: string;
  tabId: string;
  status: TWorkStatus;
  entry?: ISessionHistoryEntry;
  navigation?: TSessionNavigationTarget;
  olderEntries: ISessionHistoryEntry[];
  live?: IWorkflowTab;
}

export const sessionWorkKey = (provider: string, sessionId: string | null | undefined, fallback: string) =>
  `${provider}:${sessionId || fallback}`;

export const collectWorkSessions = (
  entries: ISessionHistoryEntry[], tabs: Record<string, IWorkflowTab>, workflow: ISessionWorkflow,
): IWorkSession[] => {
  const sessions = new Map<string, IWorkSession>();
  const deleted = new Set(workflow.deleted);
  for (const [key, record] of Object.entries(workflow.sessions ?? {})) {
    sessions.set(key, { key, ...record, entry: undefined, olderEntries: [] });
  }
  const allEntries = new Map(Object.values(workflow.sessions ?? {}).flatMap((record) => record.entry ? [[record.entry.id, record.entry] as const] : []));
  for (const entry of entries) allEntries.set(entry.id, entry);
  for (const entry of [...allEntries.values()].sort((a, b) => b.completedAt - a.completedAt)) {
    const key = sessionWorkKey(entry.providerId, entry.agentSessionId, `history:${entry.id}`);
    const existing = sessions.get(key);
    if (existing?.entry) existing.olderEntries.push(entry);
    else sessions.set(key, {
      key, workspaceId: entry.workspaceId, tabId: entry.tabId,
      status: 'review', entry, navigation: {
        workspaceId: entry.workspaceId, workspaceName: entry.workspaceName, workspaceDir: entry.workspaceDir,
        tabId: entry.tabId, providerId: entry.providerId, agentSessionId: entry.agentSessionId,
      }, olderEntries: [],
    });
  }
  for (const [tabId, tab] of Object.entries(tabs)) {
    if (!tab.agentSessionId && tab.panelType !== 'claude-code' && tab.panelType !== 'codex-cli') continue;
    const provider = tab.agentProviderId === 'codex' || tab.panelType === 'codex-cli' ? 'codex' : 'claude';
    const key = sessionWorkKey(provider, tab.agentSessionId, `tab:${tabId}`);
    const fallback = sessionWorkKey(provider, null, `tab:${tabId}`);
    if (tab.agentSessionId && !workflow.tabBindings?.[fallback]) sessions.delete(fallback);
    const existing = sessions.get(key);
    const status: TWorkStatus = tab.cliState === 'busy' || tab.cliState === 'needs-input'
      ? 'in-progress' : existing?.entry || tab.cliState === 'ready-for-review'
        ? 'review' : tab.lastUserMessage ? 'in-progress' : 'pending';
    sessions.set(key, {
      key, workspaceId: tab.workspaceId, tabId, status,
      entry: existing?.entry, olderEntries: existing?.olderEntries ?? [], live: tab,
      navigation: tab.agentSessionId ? {
        providerId: provider, agentSessionId: tab.agentSessionId, workspaceId: tab.workspaceId, tabId,
        workspaceName: tab.workspaceName ?? existing?.navigation?.workspaceName ?? tab.workspaceId,
        workspaceDir: tab.workspaceDir ?? existing?.navigation?.workspaceDir ?? null,
      } : existing?.navigation,
    });
  }
  return [...sessions.values()].filter((session) => !deleted.has(session.key)).map((session) => {
    const fallback = sessionWorkKey(session.key.split(':')[0], null, `tab:${session.tabId}`);
    const firstBindingStatus = session.live?.agentSessionId && !workflow.tabBindings?.[fallback]
      ? workflow.statuses[fallback] : undefined;
    return { ...session, status: workflow.statuses[session.key] ?? firstBindingStatus ?? session.status };
  });
};

export const reconcileSessionWorkflow = (
  workflow: ISessionWorkflow, entries: ISessionHistoryEntry[], tabs: Record<string, IWorkflowTab>,
): ISessionWorkflow => {
  const next: ISessionWorkflow = {
    ...workflow, statuses: { ...workflow.statuses },
    sessions: { ...workflow.sessions }, tabBindings: { ...workflow.tabBindings },
  };
  const deleted = new Set(next.deleted);
  for (const key of deleted) {
    delete next.statuses[key];
    delete next.sessions![key];
  }
  for (const [tabId, tab] of Object.entries(tabs)) {
    if (!tab.agentSessionId) continue;
    const provider = tab.agentProviderId === 'codex' || tab.panelType === 'codex-cli' ? 'codex' : 'claude';
    const fallback = sessionWorkKey(provider, null, `tab:${tabId}`);
    const key = sessionWorkKey(provider, tab.agentSessionId, '');
    if (!next.tabBindings![fallback]) {
      if (!deleted.has(key) && next.statuses[fallback] !== undefined && next.statuses[key] === undefined) next.statuses[key] = next.statuses[fallback];
      delete next.statuses[fallback];
      delete next.sessions![fallback];
    }
    next.tabBindings![fallback] = key;
  }
  for (const session of collectWorkSessions(entries, tabs, { ...next, statuses: {} })) {
    if (session.live && !session.live.agentSessionId && !next.statuses[session.key]) continue;
    next.sessions![session.key] = {
      workspaceId: session.workspaceId, tabId: session.tabId, status: session.status, entry: session.entry,
      navigation: session.navigation,
    };
  }
  return next;
};

export const aggregateWorkStatus = (statuses: TWorkStatus[]): TWorkStatus => {
  if (statuses.includes('in-progress')) return 'in-progress';
  if (statuses.includes('review')) return 'review';
  if (!statuses.length || statuses.includes('pending')) return 'pending';
  return 'completed';
};
