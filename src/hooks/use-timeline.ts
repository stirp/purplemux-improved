import type { IPendingUserMessageOptions } from '@/types/timeline';
import type { IInputAttempt } from '@/lib/input-queue';
import { collectTimelineTasks } from '@/lib/timeline-tasks';
import { resolveAsyncQuestionAnswers } from '@/lib/async-question-answers';
import { matchesInputMessage } from '@/lib/input-message-match';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  ITimelineEntry,
  ITimelineUserMessage,
  IInitMeta,
  ISessionStats,
  ITaskItem,
  TCliState,
  TTimelineConnectionStatus,
} from '@/types/timeline';
import useTimelineWebSocket from '@/hooks/use-timeline-websocket';
import { clearTimelineDisplaySnapshot, getTimelineDisplaySnapshot, saveTimelineDisplaySnapshot, timelineDisplayKey } from '@/lib/timeline-display-cache';

interface IResumeCallbacks {
  onResumeStarted?: (payload: { sessionId: string; jsonlPath: string | null }) => void;
  onResumeBlocked?: (payload: { reason: string; processName?: string }) => void;
  onResumeError?: (payload: { message: string }) => void;
}

export interface ITimelineSyncState {
  agentProcess: boolean | null;
  agentInstalled: boolean;
  isLoading: boolean;
}

interface IUseTimelineOptions {
  sessionName: string;
  agentSessionId?: string | null;
  claudeSessionId?: string | null;
  panelType?: 'claude-code' | 'codex-cli';
  enabled: boolean;
  resumeCallbacks?: IResumeCallbacks;
  onSync?: (state: ITimelineSyncState) => void;
  getCliState?: () => TCliState | undefined;
}

const PENDING_AUTOHIDE_DELAY_MS = 1000;
const PENDING_FADE_OUT_DURATION_MS = 200;
const ATTACHMENT_PLACEHOLDER_TIMEOUT_MS = 60_000;

const normalizeUserMessageText = (s: string) => s.replace(/\s+/g, ' ').trim();
const isPendingUserMessage = (entry: ITimelineEntry): entry is ITimelineEntry & { type: 'user-message'; pending: true } =>
  entry.type === 'user-message' && entry.pending === true;

const sameUserReceipt = (a: ITimelineUserMessage, b: ITimelineUserMessage): boolean =>
  a.timestamp === b.timestamp && a.text === b.text
  && (a.images?.length ?? 0) === (b.images?.length ?? 0)
  && (a.images ?? []).every((image, index) => image === b.images?.[index]);

const reconcileQueueReceipts = (entries: ITimelineEntry[]): ITimelineEntry[] => {
  let updated = entries;
  for (const pending of entries) {
    if (!isPendingUserMessage(pending) || !pending.queueMessage || pending.attemptedAt === undefined) continue;
    const message = pending.queueMessage;
    const confirmed = updated.findIndex((entry) => entry.type === 'user-message'
      && !entry.id.startsWith('input-') && matchesInputMessage(entry, message, pending.attemptedAt));
    if (confirmed !== -1) {
      updated = updated.flatMap((entry, index) => index === confirmed ? [{ ...entry, id: pending.id }] : entry.id === pending.id ? [] : [entry]);
    }
  }
  return updated;
};

interface IUseTimelineReturn {
  entries: ITimelineEntry[];
  tasks: ITaskItem[];
  sessionId: string | null;
  jsonlPath: string | null;
  sessionSummary: string | undefined;
  initMeta: IInitMeta | undefined;
  sessionStats: ISessionStats | null;
  agentProcess: boolean | null;
  agentInstalled: boolean;
  wsStatus: TTimelineConnectionStatus;
  isLoading: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  retrySession: () => void;
  sendResume: (sessionId: string, tmuxSession: string) => void;
  addPendingUserMessage: (text: string, options?: IPendingUserMessageOptions) => string;
  removePendingUserMessage: (id: string) => void;
  syncInputAttempts: (attempts: IInputAttempt[]) => void;
}

const useTimeline = ({
  sessionName,
  agentSessionId,
  claudeSessionId,
  panelType,
  enabled,
  resumeCallbacks,
  onSync,
  getCliState,
}: IUseTimelineOptions): IUseTimelineReturn => {
  const identity = JSON.stringify([panelType ?? 'claude-code', sessionName, agentSessionId ?? claudeSessionId ?? null]);
  const displayKey = timelineDisplayKey(panelType ?? 'claude-code', sessionName, agentSessionId ?? claudeSessionId);
  const cached = useMemo(() => getTimelineDisplaySnapshot(displayKey), [displayKey]);
  const [entries, setEntries] = useState<ITimelineEntry[]>(() => cached?.entries ?? []);
  const [agentProcess, setAgentProcess] = useState<boolean | null>(null);
  const [agentInstalled, setAgentInstalled] = useState(true);
  const [wsInitReceived, setWsInitReceived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(() => cached?.sessionId ?? null);
  const [sessionSummary, setSessionSummary] = useState<string | undefined>(() => cached?.summary);
  const [initMeta, setInitMeta] = useState<IInitMeta | undefined>(() => cached?.meta);
  const [sessionStats, setSessionStats] = useState<ISessionStats | null>(() => cached?.stats ?? null);
  const [jsonlPath, setJsonlPath] = useState<string | null>(null);

  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const jsonlPathRef = useRef<string | null>(null);
  const startByteOffsetRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const historyGenerationRef = useRef(0);
  const sessionIdRef = useRef(sessionId);

  const getCliStateRef = useRef(getCliState);
  useEffect(() => {
    getCliStateRef.current = getCliState;
  }, [getCliState]);

  const [prevIdentity, setPrevIdentity] = useState(identity);
  const [prevScope, setPrevScope] = useState(JSON.stringify([panelType ?? 'claude-code', sessionName]));
  const scope = JSON.stringify([panelType ?? 'claude-code', sessionName]);
  if (identity !== prevIdentity) setPrevIdentity(identity);
  if (scope !== prevScope || (identity !== prevIdentity && (agentSessionId ?? claudeSessionId ?? null) !== sessionId)) {
    if (scope === prevScope) {
      clearTimelineDisplaySnapshot(timelineDisplayKey(panelType ?? 'claude-code', sessionName, sessionIdRef.current));
    }
    historyGenerationRef.current++;
    setPrevScope(scope);
    setWsInitReceived(false);
    setAgentProcess(null);
    setAgentInstalled(true);
    setEntries(cached?.entries ?? []);
    setError(null);
    setHasMore(false);
    setSessionId(cached?.sessionId ?? null);
    sessionIdRef.current = cached?.sessionId ?? null;
    setSessionSummary(cached?.summary);
    setInitMeta(cached?.meta);
    setSessionStats(cached?.stats ?? null);
    setJsonlPath(null);
    jsonlPathRef.current = null;
    startByteOffsetRef.current = 0;
  }

  const isLoading = !wsInitReceived && entries.length === 0;

  useEffect(() => {
    if (!wsInitReceived || !sessionId) return;
    saveTimelineDisplaySnapshot(timelineDisplayKey(panelType ?? 'claude-code', sessionName, sessionId), {
      entries, sessionId, summary: sessionSummary, meta: initMeta, stats: sessionStats,
    });
  }, [entries, sessionId, sessionSummary, initMeta, sessionStats, wsInitReceived, panelType, sessionName]);

  const clearDisplayCache = useCallback(() => {
    clearTimelineDisplaySnapshot(timelineDisplayKey(panelType ?? 'claude-code', sessionName, sessionIdRef.current));
  }, [panelType, sessionName]);

  const handleInit = useCallback((newEntries: ITimelineEntry[], _totalEntries: number, initSessionId: string, summary?: string, meta?: IInitMeta, startByteOffset?: number, hasMoreInit?: boolean, jsonlPath?: string | null, isClaudeStarting?: boolean, initStats?: ISessionStats | null) => {
    if (sessionIdRef.current && sessionIdRef.current !== initSessionId) {
      clearTimelineDisplaySnapshot(timelineDisplayKey(panelType ?? 'claude-code', sessionName, sessionIdRef.current));
    }
    sessionIdRef.current = initSessionId || null;
    historyGenerationRef.current++;
    setWsInitReceived(true);
    setAgentInstalled(true);
    setEntries((prev) => {
      const pendings = prev.filter(isPendingUserMessage);
      // Parser IDs are regenerated on init; retain ownership by native record contents.
      const consumed = prev.filter((entry): entry is ITimelineUserMessage =>
        entry.type === 'user-message' && !entry.pending && entry.id.startsWith('input-'));

      const merged = newEntries.map((entry) => {
        if (entry.type !== 'user-message') return entry;
        const consumedIndex = consumed.findIndex((previous) => sameUserReceipt(previous, entry));
        if (consumedIndex !== -1) {
          const [previous] = consumed.splice(consumedIndex, 1);
          return { ...entry, id: previous.id };
        }
        const target = entry.text.trim();
        const matchIdx = pendings.findIndex((p) => p.queueMessage
          ? matchesInputMessage(entry, p.queueMessage, p.attemptedAt)
          : p.text.trim() === target);
        if (matchIdx === -1) return entry;
        const matched = pendings[matchIdx];
        pendings.splice(matchIdx, 1);
        return { ...entry, id: matched.id };
      });
      return [...merged, ...pendings];
    });
    startByteOffsetRef.current = startByteOffset ?? 0;
    setHasMore(hasMoreInit ?? false);
    setSessionSummary(summary);
    setInitMeta(meta);
    setSessionStats(initStats ?? null);
    jsonlPathRef.current = jsonlPath ?? null;
    setJsonlPath(jsonlPath ?? null);
    if (initSessionId) {
      setSessionId(initSessionId);
    } else if (!isClaudeStarting) {
      setSessionId(null);
      setAgentProcess(false);
    }
    setError(null);
  }, [panelType, sessionName]);

  const handleAppend = useCallback((newEntries: ITimelineEntry[]) => {
    setEntries((prev) => {
      const updated = [...prev];
      for (const entry of newEntries) {
        if (entry.type === 'user-message') {
          if (updated.some((existing) => existing.type === 'user-message' && !existing.pending
            && existing.id.startsWith('input-') && sameUserReceipt(existing, entry))) continue;
          const target = normalizeUserMessageText(entry.text);
          const pendingIdx = updated.findIndex(
            (e) => e.type === 'user-message' && e.pending && (e.queueMessage
              ? matchesInputMessage(entry, e.queueMessage, e.attemptedAt)
              : (e.attachmentPlaceholder || normalizeUserMessageText(e.text) === target)),
          );
          if (pendingIdx !== -1) {
            const pending = updated[pendingIdx] as ITimelineEntry & { type: 'user-message' };
            updated[pendingIdx] = { ...entry, id: pending.id };
            continue;
          }
        }
        if (entry.type === 'tool-result') {
          const status = entry.isError ? 'error' as const : 'success' as const;
          const tcIdx = updated.findIndex(
            (e) => e.type === 'tool-call' && e.toolUseId === entry.toolUseId,
          );
          if (tcIdx !== -1) {
            const tc = updated[tcIdx] as ITimelineEntry & { type: 'tool-call'; status: string };
            updated[tcIdx] = { ...tc, status };
          } else {
            const aqIdx = updated.findIndex(
              (e) => e.type === 'ask-user-question' && e.toolUseId === entry.toolUseId,
            );
            if (aqIdx !== -1) {
              const aq = updated[aqIdx] as ITimelineEntry & { type: 'ask-user-question'; status: string; answer?: string };
              updated[aqIdx] = { ...aq, status, answer: entry.summary || undefined };
            }
          }
        }
        updated.push(entry);
      }
      return updated;
    });
  }, []);

  const addPendingUserMessage = useCallback((text: string, options?: IPendingUserMessageOptions): string => {
    const trimmed = text.trim();
    const id = options?.queueMessage ? `input-${options.queueMessage.id}` : `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!trimmed && !options?.images?.length) return id;
    const pendingEntry: ITimelineEntry = {
      id,
      type: 'user-message',
      timestamp: Date.now(),
      text: trimmed,
      pending: true,
      attachmentPlaceholder: options?.attachmentPlaceholder,
      images: options?.images,
      queueMessage: options?.queueMessage,
      deliveryState: options?.deliveryState,
    };
    setEntries((prev) => {
      const index = prev.findIndex((entry) => entry.id === id);
      if (index !== -1 && !isPendingUserMessage(prev[index])) return prev;
      if (index === -1) return [...prev, pendingEntry];
      const existing = prev[index];
      if (!isPendingUserMessage(existing)) return prev;
      if (existing.deliveryState === pendingEntry.deliveryState
        && existing.queueMessage?.createdAt === pendingEntry.queueMessage?.createdAt
        && existing.queueMessage?.attachments.every((attachment, i) =>
          attachment.imageHash === pendingEntry.queueMessage?.attachments[i]?.imageHash)) return prev;
      return reconcileQueueReceipts(prev.map((entry, i) => i === index
        ? { ...pendingEntry, timestamp: existing.timestamp, attemptedAt: existing.attemptedAt } : entry));
    });

    if (options?.attachmentPlaceholder) {
      setTimeout(() => {
        setEntries((prev) =>
          prev.filter(
            (e) => !(e.id === id && e.type === 'user-message' && e.pending === true && e.attachmentPlaceholder === true),
          ),
        );
      }, ATTACHMENT_PLACEHOLDER_TIMEOUT_MS);
    } else if (options?.autoHide !== false) {
      setTimeout(() => {
        if (getCliStateRef.current?.() !== 'busy') return;
        setEntries((prev) =>
          prev.some((e) => e.id !== id)
            ? prev.map((e) =>
                e.id === id && e.type === 'user-message' && e.pending === true
                  ? { ...e, fadingOut: true }
                  : e,
              )
            : prev,
        );
        setTimeout(() => {
          setEntries((prev) => {
            if (!prev.some((e) => e.id !== id)) return prev;
            return prev.filter(
              (e) => !(e.id === id && e.type === 'user-message' && e.pending === true),
            );
          });
        }, PENDING_FADE_OUT_DURATION_MS);
      }, PENDING_AUTOHIDE_DELAY_MS);
    }
    return id;
  }, []);

  const syncInputAttempts = useCallback((attempts: IInputAttempt[]) => {
    const byId = new Map(attempts.map(({ id, at }) => [id, at]));
    setEntries((prev) => {
      let changed = false;
      const updated = prev.map((entry) => {
        if (!isPendingUserMessage(entry) || !entry.queueMessage) return entry;
        const at = byId.get(entry.queueMessage.id);
        if (at === undefined || at === entry.attemptedAt) return entry;
        changed = true;
        return { ...entry, attemptedAt: at };
      });
      return changed ? reconcileQueueReceipts(updated) : prev;
    });
  }, []);

  const removePendingUserMessage = useCallback((id: string) => {
    setEntries((prev) =>
      prev.filter(
        (e) => !(e.id === id && e.type === 'user-message' && e.pending === true),
      ),
    );
  }, []);

  const handleSessionChanged = useCallback((newSessionId: string, reason: string) => {
    const previousSessionId = sessionIdRef.current;
    if (reason !== 'session-waiting' || (newSessionId && newSessionId !== previousSessionId)) clearDisplayCache();
    sessionIdRef.current = reason === 'session-ended' ? null : newSessionId || (reason === 'session-waiting' ? previousSessionId : null);
    if (reason !== 'session-waiting') historyGenerationRef.current++;
    if (reason === 'session-ended') {
      jsonlPathRef.current = null;
      setJsonlPath(null);
      setSessionId(null);
      setAgentProcess(false);
      setWsInitReceived(true);
      setEntries([]);
      setSessionSummary(undefined);
      setInitMeta(undefined);
      setSessionStats(null);
      setHasMore(false);
      return;
    }
    if (reason === 'session-waiting') {
      if (newSessionId && newSessionId !== previousSessionId) {
        historyGenerationRef.current++;
        setEntries((prev) => prev.filter(isPendingUserMessage));
        setWsInitReceived(false);
        setSessionStats(null);
        setInitMeta(undefined);
        setSessionSummary(undefined);
        setHasMore(false);
        jsonlPathRef.current = null;
        setJsonlPath(null);
      }
      if (newSessionId) {
        setAgentProcess(true);
        setSessionId(newSessionId);
      } else {
        setAgentProcess(true);
      }
      return;
    }
    setSessionId(newSessionId || null);
    setAgentProcess(true);
    setEntries((prev) => prev.filter(isPendingUserMessage));
    setSessionSummary(undefined);
    setInitMeta(undefined);
    setSessionStats(null);
    setHasMore(false);
    setWsInitReceived(false);
  }, [clearDisplayCache]);

  const handleStatsUpdate = useCallback((stats: ISessionStats) => {
    if (stats.sessionId === sessionIdRef.current) setSessionStats(stats);
  }, []);

  const loadMore = useCallback(async () => {
    if (!jsonlPathRef.current || isLoadingMoreRef.current || !hasMore) return;
    if (startByteOffsetRef.current <= 0) {
      setHasMore(false);
      return;
    }
    isLoadingMoreRef.current = true;
    const generation = historyGenerationRef.current;
    const path = jsonlPathRef.current;
    try {
      const res = await fetch(
        `/api/timeline/entries?jsonlPath=${encodeURIComponent(path)}&beforeByte=${startByteOffsetRef.current}&mode=turn`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (generation !== historyGenerationRef.current || path !== jsonlPathRef.current) return;
      const loadedEntries = data.entries as ITimelineEntry[];
      setEntries((prev) => [...loadedEntries, ...prev]);
      startByteOffsetRef.current = data.startByteOffset;
      setHasMore(data.hasMore);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [hasMore]);

  const handleError = useCallback((err: { code: string; message: string }) => {
    if (err.code === 'not-installed') {
      setAgentInstalled(false);
      return;
    }
    console.warn(`[timeline] WebSocket error: ${err.code} — ${err.message}`);
  }, []);

  const resumeCallbacksRef = useRef(resumeCallbacks);
  useEffect(() => {
    resumeCallbacksRef.current = resumeCallbacks;
  }, [resumeCallbacks]);

  const handleResumeStarted = useCallback(
    (payload: { sessionId: string; jsonlPath: string | null }) => {
      clearDisplayCache();
      historyGenerationRef.current++;
      sessionIdRef.current = payload.sessionId;
      jsonlPathRef.current = payload.jsonlPath;
      setJsonlPath(payload.jsonlPath);
      setSessionStats(null);
      setInitMeta(undefined);
      setSessionSummary(undefined);
      setHasMore(false);
      setSessionId(payload.sessionId);
      setAgentProcess(true);
      setEntries([]);
      setWsInitReceived(false);
      resumeCallbacksRef.current?.onResumeStarted?.(payload);
    },
    [clearDisplayCache],
  );

  const handleResumeBlocked = useCallback(
    (payload: { reason: string; processName?: string }) => {
      resumeCallbacksRef.current?.onResumeBlocked?.(payload);
    },
    [],
  );

  const handleResumeError = useCallback(
    (payload: { message: string }) => {
      resumeCallbacksRef.current?.onResumeError?.(payload);
    },
    [],
  );

  const { status: wsStatus, reconnect, sendResume } = useTimelineWebSocket({
    sessionName,
    agentSessionId,
    claudeSessionId,
    panelType,
    enabled,
    onInit: handleInit,
    onAppend: handleAppend,
    onSessionChanged: handleSessionChanged,
    onStatsUpdate: handleStatsUpdate,
    onError: handleError,
    onResumeStarted: handleResumeStarted,
    onResumeBlocked: handleResumeBlocked,
    onResumeError: handleResumeError,
  });

  const retrySession = useCallback(() => {
    setError(null);
    reconnect();
  }, [reconnect]);

  const onSyncRef = useRef(onSync);
  useEffect(() => { onSyncRef.current = onSync; }, [onSync]);

  useEffect(() => {
    onSyncRef.current?.({ agentProcess, agentInstalled, isLoading });
  }, [agentProcess, agentInstalled, isLoading]);

  const tasks = useMemo(() => collectTimelineTasks(entries), [entries]);

  const resolvedEntries = useMemo(() => resolveAsyncQuestionAnswers(entries), [entries]);

  return {
    entries: resolvedEntries,
    tasks,
    sessionId,
    jsonlPath,
    sessionSummary,
    initMeta,
    sessionStats,
    agentProcess,
    agentInstalled,
    wsStatus,
    isLoading,
    error,
    loadMore,
    hasMore,
    retrySession,
    sendResume,
    addPendingUserMessage,
    removePendingUserMessage,
    syncInputAttempts,
  };
};

export default useTimeline;
