import type { IInputTarget, IQueuedInput } from '@/lib/input-queue';
import { InputDeliveryError } from '@/lib/input-queue';
import { matchesInputMessage } from '@/lib/input-message-match';
import { createCodexParser, type CodexParser } from '@/lib/session-parser-codex';
import { findCodexSessionById, readCodexSessionMeta } from '@/lib/providers/codex/session-detection';
import { getStatusManager } from '@/lib/status-manager';

export const createCodexInputReceipt = (target: IInputTarget, message: IQueuedInput, since: number) => {
  let parser: CodexParser | undefined;
  let sessionId = target.agentSessionId;
  let received = false;
  let completed = false;

  return async () => {
    const status = getStatusManager().getAllForClient()[target.tabId];
    if (!status || status.workspaceId !== target.workspaceId || status.agentProviderId !== 'codex'
      || (sessionId && status.agentSessionId && sessionId !== status.agentSessionId)) {
      throw new InputDeliveryError('sessionChanged');
    }
    sessionId ??= status.agentSessionId;
    if (!sessionId) return { received: false, completed: false };
    target.agentSessionId ??= sessionId;
    let entries;
    if (!parser) {
      const boundPath = getStatusManager().getSessionJsonlPath(target.tabId, sessionId);
      const boundSession = boundPath ? await readCodexSessionMeta(boundPath) : null;
      if (boundSession && boundSession.sessionId !== sessionId) throw new InputDeliveryError('sessionChanged');
      const session = boundSession ?? await findCodexSessionById(sessionId);
      if (!session) return { received: false, completed: false };
      parser = createCodexParser(session.jsonlPath);
      entries = await parser.parseSince(since);
    } else {
      entries = (await parser.parseIncremental()).newEntries;
    }
    for (const entry of entries) {
      if (entry.type === 'user-message' && matchesInputMessage(entry, message, since)) received = true;
      if (received && (entry.type === 'turn-end' || entry.type === 'interrupt')) completed = true;
    }
    return { received, completed };
  };
};
