import type { IInputAttempt } from '@/lib/input-queue';
import type { IPendingUserMessageOptions } from '@/types/timeline';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/ui/spinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import OpenAIIcon from '@/components/icons/openai-icon';
import useTabStore, { selectSessionView } from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTimeline from '@/hooks/use-timeline';
import { useCodexSessions } from '@/hooks/use-codex-sessions';
import useCodexBootCheck from '@/hooks/use-codex-boot-check';
import { useSessionMetaCompute } from '@/hooks/use-session-meta';
import CodexBootProgress from '@/components/features/workspace/codex-boot-progress';
import CodexUpdatePromptCard from '@/components/features/workspace/codex-update-prompt-card';
import TrustPromptCard from '@/components/features/workspace/trust-prompt-card';
import TimelineView from '@/components/features/timeline/timeline-view';
import SessionMetaBar, { SessionMetaBarSkeleton } from '@/components/features/workspace/session-meta-bar';
import CodexSessionListView from '@/components/features/workspace/codex-session-list-view';
import type { ICodexSessionEntry } from '@/lib/codex-session-list';
import type { ICodexUpdatePromptInfo, TCodexUpdateAnswer } from '@/lib/codex-update-prompt-detector';
import type { ITrustPromptInfo, TTrustAnswer } from '@/lib/trust-prompt-detector';

interface ICodexPanelProps {
  tabId: string;
  sessionName: string;
  cwd?: string;
  className?: string;
  onClose?: () => void;
  onNewSession?: () => void;
  onRestart?: () => void;
  updatePrompt?: ICodexUpdatePromptInfo | null;
  onUpdatePromptResponse?: (answer: TCodexUpdateAnswer) => void;
  trustPrompt?: ITrustPromptInfo | null;
  onTrustResponse?: (answer: TTrustAnswer) => void | Promise<void>;
  scrollToBottomRef?: React.MutableRefObject<(() => void) | undefined>;
  addPendingMessageRef?: React.MutableRefObject<((text: string, options?: IPendingUserMessageOptions) => string) | undefined>;
  syncInputAttemptsRef?: React.MutableRefObject<((attempts: IInputAttempt[]) => void) | undefined>;
  removePendingMessageRef?: React.MutableRefObject<((id: string) => void) | undefined>;
}

const CodexPanel = ({
  tabId,
  sessionName,
  cwd,
  className,
  onClose: _onClose,
  onNewSession,
  onRestart,
  updatePrompt,
  onUpdatePromptResponse,
  trustPrompt,
  onTrustResponse,
  scrollToBottomRef,
  addPendingMessageRef,
  removePendingMessageRef,
  syncInputAttemptsRef,
}: ICodexPanelProps) => {
  const t = useTranslations('terminal');
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const agentProcess = useTabStore((s) => s.tabs[tabId]?.agentProcess ?? null);
  const agentInstalled = useTabStore((s) => s.tabs[tabId]?.agentInstalled ?? true);
  const cliState = useTabStore((s) => s.tabs[tabId]?.cliState ?? 'inactive');
  const compactingSince = useTabStore((s) => s.tabs[tabId]?.compactingSince ?? null);
  const view = useTabStore((s) => selectSessionView(s.tabs, tabId));
  const codexSessionId = useTabStore((s) => s.tabs[tabId]?.agentSessionId ?? null);
  const cachedSessionMeta = useTabStore((s) => s.tabs[tabId]?.sessionMetaCache ?? null);
  const tabAgentSummary = useTabStore((s) => s.tabs[tabId]?.agentSummary ?? null);
  const tabLastUserMessage = useTabStore((s) => s.tabs[tabId]?.lastUserMessage ?? null);
  const sessionTitle = useWorkspaceStore((s) => s.sessionWorkflow.titles?.[`codex:${codexSessionId || `tab:${tabId}`}`]);

  const handleStart = useCallback(() => {
    onNewSession?.();
  }, [onNewSession]);

  const handleResumeStarted = useCallback(() => {
    setResumingSessionId(null);
  }, []);

  const handleResumeBlocked = useCallback(
    (payload: { reason: string; processName?: string }) => {
      setResumingSessionId(null);
      toast.warning(t('resumeBlocked'), {
        description: payload.processName
          ? t('resumeBlockedProcess', { name: payload.processName })
          : undefined,
      });
    },
    [t],
  );

  const handleResumeError = useCallback(() => {
    setResumingSessionId(null);
    toast.error(t('codexResumeFailed'));
  }, [t]);

  const {
    entries,
    tasks,
    sessionId,
    jsonlPath,
    sessionSummary,
    initMeta,
    sessionStats,
    agentProcess: agentProcessFromTimeline,
    wsStatus,
    isLoading: isTimelineLoading,
    error: timelineError,
    loadMore: loadMoreTimeline,
    hasMore: timelineHasMore,
    retrySession,
    sendResume,
    addPendingUserMessage,
    removePendingUserMessage,
    syncInputAttempts,
  } = useTimeline({
    sessionName,
    agentSessionId: codexSessionId,
    panelType: 'codex-cli',
    enabled: !!sessionName,
    resumeCallbacks: {
      onResumeStarted: handleResumeStarted,
      onResumeBlocked: handleResumeBlocked,
      onResumeError: handleResumeError,
    },
    onSync: (state) => {
      const checkedAt = Date.now();
      if (state.agentProcess !== null) {
        useTabStore.getState().setAgentProcess(tabId, state.agentProcess, checkedAt);
      }
      if (!state.agentInstalled) {
        useTabStore.getState().setAgentInstalled(tabId, false);
      }
      useTabStore.getState().setTimelineLoading(tabId, state.isLoading);
    },
    getCliState: () => useTabStore.getState().tabs[tabId]?.cliState,
  });

  const {
    sessions: codexSessions,
    isLoading: isCodexSessionListLoading,
    error: codexSessionListError,
    refresh: refetchCodexSessions,
  } = useCodexSessions(cwd, !!cwd && view === 'session-list' && agentProcess !== true);

  useEffect(() => {
    if (addPendingMessageRef) addPendingMessageRef.current = addPendingUserMessage;
    if (removePendingMessageRef) removePendingMessageRef.current = removePendingUserMessage;
    if (syncInputAttemptsRef) syncInputAttemptsRef.current = syncInputAttempts;
    return () => {
      if (addPendingMessageRef) addPendingMessageRef.current = undefined;
      if (removePendingMessageRef) removePendingMessageRef.current = undefined;
      if (syncInputAttemptsRef) syncInputAttemptsRef.current = undefined;
    };
  }, [addPendingMessageRef, removePendingMessageRef, addPendingUserMessage, removePendingUserMessage, syncInputAttemptsRef, syncInputAttempts]);

  const prevAgentProcessRef = useRef(agentProcess);
  useEffect(() => {
    const prev = prevAgentProcessRef.current;
    prevAgentProcessRef.current = agentProcess;
    if (prev !== true && agentProcess === true && agentProcessFromTimeline !== true) {
      retrySession();
    }
  }, [agentProcess, agentProcessFromTimeline, retrySession]);

  useEffect(() => {
    if (cliState !== 'unknown') return;
    const controller = new AbortController();
    fetch('/api/tmux/recover-unknown', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tabId }),
      signal: controller.signal,
    }).catch(() => {});
    return () => controller.abort();
  }, [tabId, cliState]);

  const bootFailed = useCodexBootCheck(tabId, sessionName);

  const isHeaderLoading = agentProcess === null || (entries.length === 0 && isTimelineLoading);
  const freshMeta = useSessionMetaCompute(entries, sessionSummary, initMeta, sessionStats, tabAgentSummary, tabLastUserMessage);

  useEffect(() => {
    if (!isHeaderLoading) {
      useTabStore.getState().setSessionMetaCache(tabId, { meta: freshMeta, sessionId, jsonlPath });
    }
  }, [isHeaderLoading, freshMeta, sessionId, jsonlPath, tabId]);

  const handleSelectCodexSession = useCallback(
    (session: ICodexSessionEntry) => {
      if (resumingSessionId) return;
      setResumingSessionId(session.sessionId);
      sendResume(session.sessionId, sessionName);
    },
    [resumingSessionId, sendResume, sessionName],
  );

  if (!agentInstalled) {
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground',
          className,
        )}
        role="status"
      >
        <OpenAIIcon size={32} className="text-muted-foreground/60" />
        <span className="text-sm font-medium text-foreground">{t('codexNotInstalled')}</span>
      </div>
    );
  }

  if (updatePrompt && onUpdatePromptResponse) {
    return (
      <div
        className={cn(
          'animate-delayed-fade-in flex h-full w-full flex-col items-center justify-center gap-3 px-6',
          className,
        )}
      >
        <CodexUpdatePromptCard prompt={updatePrompt} onRespond={onUpdatePromptResponse} />
      </div>
    );
  }

  if (trustPrompt && onTrustResponse) {
    return (
      <div className={cn('flex h-full w-full flex-col items-center justify-center animate-delayed-fade-in', className)}>
        <TrustPromptCard
          folderPath={trustPrompt.folderPath}
          agent={trustPrompt.agent}
          canRespond={trustPrompt.selection.mode !== 'unavailable'}
          onRespond={onTrustResponse}
        />
      </div>
    );
  }

  if (view === 'check') {
    return (
      <div
        className={cn(
          'animate-delayed-fade-in flex h-full w-full flex-col items-center justify-center gap-3 px-6',
          className,
        )}
      >
        <CodexBootProgress hasFailed={bootFailed} onRestart={onRestart} />
      </div>
    );
  }

  if (view === 'session-list') {
    if (agentProcess === null || !cwd) {
      return (
        <div className={cn('flex h-full w-full flex-col items-center justify-center animate-delayed-fade-in', className)}>
          <Spinner className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className={cn('h-full w-full', className)}>
        <CodexSessionListView
          sessions={codexSessions}
          isLoading={isCodexSessionListLoading}
          error={codexSessionListError ? t('codexSessionsLoadFailed') : null}
          resumingSessionId={resumingSessionId}
          onSelectSession={handleSelectCodexSession}
          onRefresh={refetchCodexSessions}
          onNewSession={onNewSession}
        />
      </div>
    );
  }

  if (cliState === 'inactive' && agentProcess === false && !codexSessionId && !isTimelineLoading) {
    return (
      <div
        className={cn(
          'flex h-full w-full flex-col items-center justify-center gap-4 px-6 text-center',
          className,
        )}
        role="status"
      >
        <OpenAIIcon size={32} className="text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">{t('codexInactiveMessage')}</p>
        {onNewSession && (
          <Button size="sm" onClick={handleStart}>
            <Plus className="size-3.5" />
            {t('codexStartSession')}
          </Button>
        )}
      </div>
    );
  }

  const displayMeta = isHeaderLoading
    ? cachedSessionMeta
    : { meta: freshMeta, sessionId, jsonlPath };

  return (
    <div className={cn('flex min-h-0 w-full flex-1 flex-col', className)}>
      {displayMeta ? (
        <SessionMetaBar
          provider="codex"
          tabId={tabId}
          statusDisabled={isHeaderLoading || !!resumingSessionId || wsStatus !== 'connected'}
          meta={sessionTitle ? { ...displayMeta.meta, title: sessionTitle } : displayMeta.meta}
          sessionName={sessionName}
          sessionId={displayMeta.sessionId}
          jsonlPath={displayMeta.jsonlPath}
        />
      ) : (
        <SessionMetaBarSkeleton />
      )}
      <div className="min-h-0 flex-1">
        <TimelineView
          cwd={cwd}
          entries={entries}
          tasks={tasks}
          sessionId={sessionId}
          sessionName={sessionName}
          tabId={tabId}
          initMeta={initMeta}
          sessionStats={sessionStats}
          cliState={cliState}
          compactingSince={compactingSince}
          wsStatus={wsStatus}
          isLoading={isTimelineLoading}
          error={timelineError}
          onRetry={retrySession}
          onLoadMore={loadMoreTimeline}
          hasMore={timelineHasMore}
          scrollToBottomRef={scrollToBottomRef}
        />
      </div>
    </div>
  );
};

export default CodexPanel;
