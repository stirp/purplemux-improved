import type { IWorkSession } from '@/lib/session-workflow';
import { stripMarkdown } from '@/lib/strip-markdown';
import type { ISessionHistoryEntry } from '@/types/session-history';

export interface ISessionSearchItem {
  session: IWorkSession;
  title?: string | null;
  workspaceName: string;
  workspaceDirectories?: string[];
}

export const searchSessions = (items: ISessionSearchItem[], query: string): ISessionSearchItem[] => {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return items;
  const matches = (values: (string | null | undefined)[]) =>
    values.some((value) => value?.toLowerCase().includes(keyword));
  const matchesEntry = (entry?: ISessionHistoryEntry) => !!entry && matches([
    stripMarkdown(entry.prompt ?? ''), stripMarkdown(entry.result ?? ''),
    entry.workspaceName, entry.workspaceDir, entry.agentSessionId,
  ]);

  return items.flatMap((item) => {
    const { session, title, workspaceName } = item;
    const olderEntries = session.olderEntries.filter(matchesEntry);
    const matched = matches([
      stripMarkdown(title ?? ''), workspaceName, ...(item.workspaceDirectories ?? []),
      session.navigation?.workspaceName, session.navigation?.workspaceDir, session.navigation?.agentSessionId,
      session.live?.workspaceName, session.live?.workspaceDir, session.live?.agentSessionId,
      stripMarkdown(session.live?.lastUserMessage ?? ''),
    ]) || matchesEntry(session.entry);
    return matched || olderEntries.length ? [{ ...item, session: { ...session, olderEntries } }] : [];
  });
};
