import fs from 'fs/promises';
import path from 'path';
import { resolveLayoutDir } from '@/lib/layout-store';
import { getAllPanesInfo } from '@/lib/tmux';
import { deleteOriginalSession } from '@/lib/delete-session';
import { getSessionHistory, removeSessionHistory } from '@/lib/session-history';
import { hideSession, sessionHistoryKey } from '@/lib/hidden-sessions';
import { getStatusManager } from '@/lib/status-manager';
import type { ITab } from '@/types/terminal';
import type { TSessionHistoryProvider } from '@/types/session-history';

export interface IWorkspaceSession {
  provider: TSessionHistoryProvider;
  sessionId: string;
}

interface IDeletionProgress {
  sessions: IWorkspaceSession[];
  deleted: string[];
}
const progressFile = (workspaceId: string) => path.join(resolveLayoutDir(workspaceId), 'session-deletion.json');
const readProgress = async (workspaceId: string): Promise<IDeletionProgress> => {
  try {
    const data = JSON.parse(await fs.readFile(progressFile(workspaceId), 'utf8')) as IDeletionProgress;
    if (!Array.isArray(data.sessions) || !Array.isArray(data.deleted)
      || !data.deleted.every((key) => typeof key === 'string')
      || !data.sessions.every((session) => ['claude', 'codex'].includes(session.provider) && typeof session.sessionId === 'string')) {
      throw new Error('Invalid session deletion progress');
    }
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { sessions: [], deleted: [] };
    throw error;
  }
};
const writeProgress = async (workspaceId: string, progress: IDeletionProgress) => {
  const file = progressFile(workspaceId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(progress), { mode: 0o600 });
  await fs.rename(`${file}.tmp`, file);
};

export const collectWorkspaceSessions = async (workspaceId: string, tabs: ITab[]): Promise<IWorkspaceSession[]> => {
  const sessions = new Map<string, IWorkspaceSession>();
  const add = (provider: string | undefined, sessionId: string | null | undefined) => {
    if ((provider === 'claude' || provider === 'codex') && sessionId) {
      sessions.set(sessionHistoryKey(provider, sessionId), { provider, sessionId });
    }
  };
  for (const tab of tabs) {
    add(tab.agentState?.providerId, tab.agentState?.sessionId);
    add('claude', tab.claudeSessionId);
  }
  for (const tab of Object.values(getStatusManager().getAllForClient())) {
    if (tab.workspaceId === workspaceId) {
      add(tab.agentProviderId ?? (tab.panelType === 'codex-cli' ? 'codex' : 'claude'), tab.agentSessionId);
    }
  }
  for (const entry of await getSessionHistory()) {
    if (entry.workspaceId === workspaceId) add(entry.providerId, entry.agentSessionId);
  }
  const progress = await readProgress(workspaceId);
  for (const session of progress.sessions) add(session.provider, session.sessionId);
  const result = [...sessions.values()];
  // Preserve runtime-only IDs before stopping terminals so failed cleanup can be retried.
  await writeProgress(workspaceId, { ...progress, sessions: result });
  return result;
};

// The caller must verify that all workspace terminals have stopped first.
export const deleteWorkspaceSessions = async (
  workspaceId: string,
  sessions: IWorkspaceSession[],
): Promise<void> => {
  const progress = await readProgress(workspaceId);
  getStatusManager().removeWorkspaceTabs(workspaceId, false);
  for (const { provider, sessionId } of sessions) {
    const key = sessionHistoryKey(provider, sessionId);
    if (!progress.deleted.includes(key)) {
      const panes = await getAllPanesInfo({ strict: true });
      if ([...panes.keys()].some((name) => name.startsWith(`pt-${workspaceId}-`))) {
        throw new Error('Workspace sessions are still running');
      }
      await deleteOriginalSession(provider, sessionId, workspaceId);
      progress.deleted.push(key);
      await writeProgress(workspaceId, progress);
    }
    await hideSession(provider, sessionId);
    await removeSessionHistory(provider, sessionId);
  }
  for (const entry of await getSessionHistory()) {
    if (entry.workspaceId === workspaceId && !entry.agentSessionId) {
      await removeSessionHistory(entry.providerId, null, entry.id);
    }
  }
  getStatusManager().broadcast({ type: 'session-history:sync', entries: await getSessionHistory() });
};
