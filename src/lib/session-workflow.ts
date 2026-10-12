import type { ISessionHistoryEntry } from '@/types/session-history';
import type { TCliState } from '@/types/timeline';

export const WORK_STATUSES = ['pending', 'in-progress', 'review', 'completed'] as const;
export type TWorkStatus = typeof WORK_STATUSES[number];
export interface ISessionWorkflow {
  statuses: Record<string, TWorkStatus>;
  collapsed: Partial<Record<TWorkStatus, boolean>>;
}
export interface IWorkflowTab {
  workspaceId: string;
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
  olderEntries: ISessionHistoryEntry[];
  live?: IWorkflowTab;
}

export const sessionWorkKey = (provider: string, sessionId: string | null | undefined, fallback: string) =>
  `${provider}:${sessionId || fallback}`;

export const collectWorkSessions = (
  entries: ISessionHistoryEntry[], tabs: Record<string, IWorkflowTab>, workflow: ISessionWorkflow,
): IWorkSession[] => {
  const sessions = new Map<string, IWorkSession>();
  for (const entry of [...entries].sort((a, b) => b.completedAt - a.completedAt)) {
    const key = sessionWorkKey(entry.providerId, entry.agentSessionId, `history:${entry.id}`);
    const existing = sessions.get(key);
    if (existing) existing.olderEntries.push(entry);
    else sessions.set(key, {
      key, workspaceId: entry.workspaceId, tabId: entry.tabId,
      status: 'review', entry, olderEntries: [],
    });
  }
  for (const [tabId, tab] of Object.entries(tabs)) {
    if (!tab.agentSessionId && tab.panelType !== 'claude-code' && tab.panelType !== 'codex-cli') continue;
    const provider = tab.agentProviderId === 'codex' || tab.panelType === 'codex-cli' ? 'codex' : 'claude';
    const key = sessionWorkKey(provider, tab.agentSessionId, `tab:${tabId}`);
    const existing = sessions.get(key);
    const status: TWorkStatus = tab.cliState === 'busy' || tab.cliState === 'needs-input'
      ? 'in-progress' : existing || tab.cliState === 'ready-for-review'
        ? 'review' : tab.lastUserMessage ? 'in-progress' : 'pending';
    sessions.set(key, {
      key, workspaceId: tab.workspaceId, tabId, status,
      entry: existing?.entry, olderEntries: existing?.olderEntries ?? [], live: tab,
    });
  }
  return [...sessions.values()].map((session) => ({
    ...session, status: workflow.statuses[session.key] ?? session.status,
  }));
};

export const aggregateWorkStatus = (statuses: TWorkStatus[]): TWorkStatus => {
  if (statuses.includes('in-progress')) return 'in-progress';
  if (statuses.includes('review')) return 'review';
  if (!statuses.length || statuses.includes('pending')) return 'pending';
  return 'completed';
};
