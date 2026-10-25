import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Spinner from '@/components/ui/spinner';
import OpenAIIcon from '@/components/icons/openai-icon';
import useTabStore, { selectSessionView } from '@/hooks/use-tab-store';
import useTimeline from '@/hooks/use-timeline';
import { useCodexSessions } from '@/hooks/use-codex-sessions';
import useCodexBootCheck from '@/hooks/use-codex-boot-check';
import useSessionMeta from '@/hooks/use-session-meta';
import useGitBranch from '@/hooks/use-git-branch';
import useGitStatus from '@/hooks/use-git-status';
import useTmuxInfo from '@/hooks/use-tmux-info';
import useMessageCounts from '@/hooks/use-message-counts';
import CodexBootProgress from '@/components/features/workspace/codex-boot-progress';
import CodexUpdatePromptCard from '@/components/features/workspace/codex-update-prompt-card';
import TrustPromptCard from '@/components/features/workspace/trust-prompt-card';
import TimelineView from '@/components/features/timeline/timeline-view';
import WebInputBar from '@/components/features/workspace/web-input-bar';
import QuickPromptBar from '@/components/features/workspace/quick-prompt-bar';
import useQuickPrompts from '@/hooks/use-quick-prompts';
import SessionMetaHeader from '@/components/features/workspace/session-meta-header';
import MobileMetaSheet from './mobile-meta-sheet';
import CodexSessionListView from '@/components/features/workspace/codex-session-list-view';
import AgentStatusLine from '@/components/features/workspace/agent-status-line';
import type { ICodexSessionEntry } from '@/lib/codex-session-list';
import type { ICodexUpdatePromptInfo, TCodexUpdateAnswer } from '@/lib/codex-update-prompt-detector';
import type { ITrustPromptInfo, TTrustAnswer } from '@/lib/trust-prompt-detector';

interface IMobileCodexPanelProps {
  tabId?: string;
  wsId?: string;
  sessionName?: string;
  cwd?: string;
  sendStdin: (data: string) => void;
  terminalWsConnected: boolean;
  focusTerminal: () => void;
  focusInputRef: React.MutableRefObject<(() => void) | undefined>;
  setInputValueRef: React.MutableRefObject<((v: string) => void) | undefined>;
  onNewSession?: () => void;
  onRestart?: () => void;
  onNativeCommands?: (text: string) => void;
  nativeCommandsActive?: boolean;
  updatePrompt?: ICodexUpdatePromptInfo | null;
  onUpdatePromptResponse?: (answer: TCodexUpdateAnswer) => void;
  trustPrompt?: ITrustPromptInfo | null;
  onTrustResponse?: (answer: TTrustAnswer) => void | Promise<void>;
  onCheckTerminal?: () => void;
}

const MobileCodexPanel = ({
  tabId,
  wsId,
  sessionName,
  cwd,
  sendStdin,
  terminalWsConnected,
  focusTerminal,
  focusInputRef,
  setInputValueRef,
  onNewSession,
  onRestart,
  onNativeCommands,
  nativeCommandsActive,
  updatePrompt,
  onUpdatePromptResponse,
  trustPrompt,
  onTrustResponse,
  onCheckTerminal,
}: IMobileCodexPanelProps) => {
  const t = useTranslations('terminal');
  const agentProcess = useTabStore((s) => (tabId ? s.tabs[tabId]?.agentProcess ?? null : null));
  const agentInstalled = useTabStore((s) => (tabId ? s.tabs[tabId]?.agentInstalled ?? true : true));
  const cliState = useTabStore((s) => (tabId ? s.tabs[tabId]?.cliState ?? 'inactive' : 'inactive'));
  const compactingSince = useTabStore((s) => (tabId ? s.tabs[tabId]?.compactingSince ?? null : null));
  const codexSessionId = useTabStore((s) => (tabId ? s.tabs[tabId]?.agentSessionId ?? null : null));
  const tabAgentSummary = useTabStore((s) => (tabId ? s.tabs[tabId]?.agentSummary ?? null : null));
  const tabLastUserMessage = useTabStore((s) => (tabId ? s.tabs[tabId]?.lastUserMessage ?? null : null));
  const view = useTabStore((s) => (tabId ? selectSessionView(s.tabs, tabId) : 'session-list' as const));
  const [metaSheetOpen, setMetaSheetOpen] = useState(false);
  const [resumingSessionId, setResumingSessionId] = useState<string | null>(null);
  const scrollToBottomRef = useRef<(() => void) | undefined>(undefined);
  const { prompts: quickPrompts } = useQuickPrompts();

  const handleStart = useCallback(() => onNewSession?.(), [onNewSession]);
  const handleScrollToBottom = useCallback(() => {
    if (cliState !== 'idle') return;
    scrollToBottomRef.current?.();
  }, [cliState]);
  const handleSelectQuickPrompt = useCallback((prompt: string) => {
    setInputValueRef.current?.(prompt);
    focusInputRef.current?.();
  }, [setInputValueRef, focusInputRef]);
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
    agentProcess: agentProcessFromTimeline,
  } = useTimeline({
    sessionName: sessionName ?? '',
    agentSessionId: codexSessionId,
    panelType: 'codex-cli',
    enabled: !!sessionName,
    resumeCallbacks: {
      onResumeStarted: handleResumeStarted,
      onResumeBlocked: handleResumeBlocked,
      onResumeError: handleResumeError,
    },
    onSync: tabId ? (state) => {
      const checkedAt = Date.now();
      if (state.agentProcess !== null) {
        useTabStore.getState().setAgentProcess(tabId, state.agentProcess, checkedAt);
      }
      if (!state.agentInstalled) {
        useTabStore.getState().setAgentInstalled(tabId, false);
      }
      useTabStore.getState().setTimelineLoading(tabId, state.isLoading);
    } : undefined,
    getCliState: tabId ? () => useTabStore.getState().tabs[tabId]?.cliState : undefined,
  });

  const {
    sessions: codexSessions,
    isLoading: isCodexSessionListLoading,
    error: codexSessionListError,
    refresh: refetchCodexSessions,
  } = useCodexSessions(cwd, !!cwd && view === 'session-list' && agentProcess !== true);

  const prevAgentProcessRef = useRef(agentProcess);
  useEffect(() => {
    const prev = prevAgentProcessRef.current;
    prevAgentProcessRef.current = agentProcess;
    if (prev !== true && agentProcess === true && agentProcessFromTimeline !== true) {
      retrySession();
    }
  }, [agentProcess, agentProcessFromTimeline, retrySession]);

  useEffect(() => {
    if (!tabId || cliState !== 'unknown') return;
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

  const { meta } = useSessionMeta(entries, sessionSummary, initMeta, sessionStats, tabAgentSummary, tabLastUserMessage);
  const { branch, isLoading: isBranchLoading } = useGitBranch(sessionName ?? '');
  const { status: gitStatus } = useGitStatus(sessionName ?? '', metaSheetOpen);
  const tmuxInfo = useTmuxInfo(sessionName ?? '', metaSheetOpen);
  const messageCounts = useMessageCounts(jsonlPath, metaSheetOpen);
  const metaWithCounts = messageCounts
    ? { ...meta, userCount: messageCounts.userCount, assistantCount: messageCounts.assistantCount }
    : meta;

  const handleSelectCodexSession = useCallback(
    (session: ICodexSessionEntry) => {
      if (!sessionName || resumingSessionId) return;
      setResumingSessionId(session.sessionId);
      sendResume(session.sessionId, sessionName);
    },
    [resumingSessionId, sendResume, sessionName],
  );

  if (!agentInstalled) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-muted px-6 text-center text-muted-foreground"
        role="status"
      >
        <OpenAIIcon size={32} className="text-muted-foreground/60" />
        <span className="text-sm font-medium text-foreground">{t('codexNotInstalled')}</span>
      </div>
    );
  }

  if (updatePrompt && onUpdatePromptResponse) {
    return (
      <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4">
        <CodexUpdatePromptCard prompt={updatePrompt} onRespond={onUpdatePromptResponse} />
      </div>
    );
  }

  if (trustPrompt && onTrustResponse) {
    return (
      <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4">
        <TrustPromptCard
          folderPath={trustPrompt.folderPath}
          agent={trustPrompt.agent}
          canRespond={trustPrompt.selection.mode !== 'unavailable'}
          onRespond={onTrustResponse}
        />
        {onCheckTerminal && (
          <button className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground" onClick={onCheckTerminal}>
            {t('checkTerminal')}
          </button>
        )}
      </div>
    );
  }

  if (view === 'check') {
    return (
      <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4">
        <CodexBootProgress hasFailed={bootFailed} onRestart={onRestart} onShowTerminal={onCheckTerminal} />
      </div>
    );
  }

  if (view === 'session-list') {
    if (agentProcess === null || !cwd) {
      return (
        <div className="animate-delayed-fade-in flex min-h-0 flex-1 flex-col items-center justify-center bg-muted px-4">
          <Spinner className="h-4 w-4 text-muted-foreground" />
        </div>
      );
    }

    return (
      <div className="min-h-0 flex-1 bg-muted">
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
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-muted px-6 text-center" role="status">
        <OpenAIIcon size={32} className="text-muted-foreground/60" />
        <p className="text-sm font-medium text-foreground">{t('codexInactiveMessage')}</p>
        {onNewSession && (
          <Button size="default" className="min-h-11" onClick={handleStart}>
            <Plus className="size-4" />
            {t('codexStartSession')}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-muted">
      <SessionMetaHeader
        meta={meta}
        branch={branch}
        provider="codex"
        tabId={tabId}
        sessionId={sessionId}
        statusDisabled={agentProcess === null || isTimelineLoading || !!resumingSessionId || wsStatus !== 'connected'}
        expanded={metaSheetOpen}
        onExpand={() => setMetaSheetOpen(true)}
      />
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
      <div className="shrink-0 pb-3">
        <WebInputBar
          onNativeCommands={onNativeCommands}
          nativeCommandsActive={nativeCommandsActive}
          tabId={tabId}
          wsId={wsId}
          sessionName={sessionName}
          agentSessionId={codexSessionId}
          provider="codex"
          cliState={cliState}
          sendStdin={sendStdin}
          terminalWsConnected={terminalWsConnected}
          visible={view === 'timeline'}
          focusTerminal={focusTerminal}
          focusInputRef={focusInputRef}
          setInputValueRef={setInputValueRef}
          maxRows={3}
          onRestartSession={onRestart}
          onSend={handleScrollToBottom}
          onOptimisticSend={addPendingUserMessage}
          onAddPendingMessage={addPendingUserMessage}
          onRemovePendingMessage={removePendingUserMessage}
          onSyncInputAttempts={syncInputAttempts}
        />
        <QuickPromptBar
          prompts={quickPrompts}
          visible={view === 'timeline'}
          onSelect={handleSelectQuickPrompt}
        />
      </div>
      {tabId && <AgentStatusLine provider="codex" key={`${sessionName}:${codexSessionId ?? ''}`} tabId={tabId} enabled={terminalWsConnected} />}
      <MobileMetaSheet
        open={metaSheetOpen}
        onOpenChange={setMetaSheetOpen}
        meta={metaWithCounts}
        toolCount={messageCounts?.toolCount ?? null}
        toolBreakdown={messageCounts?.toolBreakdown ?? null}
        branch={branch}
        isBranchLoading={isBranchLoading}
        sessionId={sessionId}
        gitStatus={gitStatus}
        tmuxInfo={tmuxInfo}
      />
    </div>
  );
};

export default MobileCodexPanel;
