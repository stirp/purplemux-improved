import { hideSession } from '@/lib/hidden-sessions';
import { removeSessionHistory } from '@/lib/session-history';
import { removeSessionWorkflow } from '@/lib/workspace-store';
import { getStatusManager } from '@/lib/status-manager';
import type { TSessionHistoryProvider } from '@/types/session-history';

export const removeSessionRecords = async (
  provider: TSessionHistoryProvider,
  sessionId: string | null,
  historyEntryId?: string,
): Promise<void> => {
  if (sessionId) await hideSession(provider, sessionId);
  await removeSessionWorkflow(provider, sessionId, historyEntryId);
  const entries = await removeSessionHistory(provider, sessionId, historyEntryId);
  getStatusManager().broadcast({ type: 'session-history:sync', entries });
};
