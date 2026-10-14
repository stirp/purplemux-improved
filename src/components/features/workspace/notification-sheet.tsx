import { useMemo, useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslations } from 'next-intl';
import {
  Circle,
  Clock3,
  CheckCircle2,
  ChevronRight,
  FileText,
  FilePen,
  FilePlus,
  Terminal,
  Search,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import dayjs from 'dayjs';
import { useRouter } from 'next/router';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import useTabStore from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { collectWorkSessions, WORK_STATUSES, type TWorkStatus } from '@/lib/session-workflow';
import { useSessionWorkflowMutation, forgetSessionWorkflow } from '@/hooks/use-session-workflow';
import { navigateToTab, useLayoutStore } from '@/hooks/use-layout';
import { navigateToSession } from '@/hooks/use-session-navigation';
import { findPane } from '@/lib/layout-tree';
import type { ICurrentAction } from '@/types/status';
import type { ISessionHistoryEntry, TSessionHistoryProvider } from '@/types/session-history';
import { stripMarkdown } from '@/lib/strip-markdown';
import { agentSessionTitle } from '@/lib/agent-session-title';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import OpenAIIcon from '@/components/icons/openai-icon';
import SessionHistoryActions from './session-history-actions';

const ACTION_ICONS: Record<string, typeof FileText> = {
  Read: FileText,
  Edit: FilePen,
  Write: FilePlus,
  Bash: Terminal,
  Grep: Search,
  Glob: Search,
  Agent: Users,
};

interface IActiveTabInfo {
  id: string | null;
  agentSessionId: string | null;
  providerId: TSessionHistoryProvider | null;
}

const useActiveTab = (): IActiveTabInfo => {
  const router = useRouter();
  const isTerminalPage = router.pathname === '/';
  return useLayoutStore(useShallow((s): IActiveTabInfo => {
    if (!isTerminalPage) return { id: null, agentSessionId: null, providerId: null };
    if (!s.layout?.activePaneId) return { id: null, agentSessionId: null, providerId: null };
    const pane = findPane(s.layout.root, s.layout.activePaneId);
    if (!pane?.activeTabId) return { id: null, agentSessionId: null, providerId: null };
    const tab = pane.tabs.find((t) => t.id === pane.activeTabId);
    if (!tab) return { id: pane.activeTabId, agentSessionId: null, providerId: null };
    const providerId: TSessionHistoryProvider = tab.agentState?.providerId === 'codex' ? 'codex' : 'claude';
    const agentSessionId = tab.agentState?.sessionId ?? tab.claudeSessionId ?? null;
    return { id: pane.activeTabId, agentSessionId, providerId };
  }));
};

export const useNotificationCount = (): { busyCount: number; attentionCount: number } => {
  const tabs = useTabStore((s) => s.tabs);
  return useMemo(() => {
    let busyCount = 0;
    let attentionCount = 0;
    for (const tab of Object.values(tabs)) {
      if (tab.cliState === 'busy') busyCount++;
      else if (tab.cliState === 'ready-for-review' || tab.cliState === 'needs-input') attentionCount++;
    }
    return { busyCount, attentionCount };
  }, [tabs]);
};

interface INotificationItem {
  tabId: string;
  workspaceName: string;
  workspaceId: string;
  lastUserMessage?: string | null;
  title?: string | null;
  lastAssistantMessage?: string | null;
  currentAction?: ICurrentAction | null;
  readyForReviewAt?: number | null;
  busySince?: number | null;
  dismissedAt?: number | null;
  agentSessionId?: string | null;
  providerId: TSessionHistoryProvider;
}

interface INotificationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ProviderBadge = ({ providerId }: { providerId: TSessionHistoryProvider }) => {
  const Icon = providerId === 'codex' ? OpenAIIcon : ClaudeCodeIcon;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground/60"
      aria-label={providerId === 'codex' ? 'Codex' : 'Claude'}
    >
      <Icon className="size-3" />
    </span>
  );
};

const formatNotificationTime = (ts: number): string => {
  const d = dayjs(ts);
  const now = dayjs();
  if (now.diff(d, 'minute') < 60) return d.fromNow();
  if (d.isAfter(now.startOf('day'))) return d.format('HH:mm');
  return d.format('M/D HH:mm');
};




const SessionHistoryItem = ({
  entry,
  title,
  isActiveSession,
  compact,
  icon,
  onClick,
}: {
  entry: ISessionHistoryEntry;
  title?: string | null;
  isActiveSession?: boolean;
  compact?: boolean;
  icon?: React.ReactNode;
  onClick?: () => void;
}) => {
  const t = useTranslations('notification');

  const durationText = useMemo(() => {
    const minutes = Math.round(entry.duration / 60000);
    if (minutes < 1) return t('durationUnderMinute');
    return t('durationMinutes', { count: minutes });
  }, [entry.duration, t]);

  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (entry.touchedFiles.length > 0) {
      parts.push(t('filesModified', { count: entry.touchedFiles.length }));
    }
    const total = Object.values(entry.toolUsage).reduce((a, b) => a + b, 0);
    if (total > 0 && entry.touchedFiles.length === 0) {
      parts.push(t('toolCalls', { count: total }));
    }
    return parts.join(' · ');
  }, [entry.touchedFiles, entry.toolUsage, t]);

  if (compact) {
    return (
      <div
        className="rounded px-2 py-1.5 transition-colors hover:bg-muted cursor-pointer"
        onClick={onClick}
      >
        <div className="flex items-center justify-between gap-2">
          {entry.prompt ? (
            <p className="truncate text-xs text-foreground/70">
              {stripMarkdown(entry.prompt)}
            </p>
          ) : (
            <span />
          )}
          <span className="shrink-0 text-xs text-muted-foreground/40">
            {formatNotificationTime(entry.completedAt)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground/40">
          {durationText}
          {summaryText && ` · ${summaryText}`}
        </p>
      </div>
    );
  }

  return (
    <SessionHistoryActions
      provider={entry.providerId}
      sessionId={entry.agentSessionId}
      historyEntryId={entry.id}
      label={entry.prompt}
      onDeleted={async () => {
        forgetSessionWorkflow(entry.providerId, entry.agentSessionId, entry.id);
        useSessionHistoryStore.setState((state) => ({
          entries: state.entries.filter((item) => item.providerId !== entry.providerId || (
            entry.agentSessionId ? item.agentSessionId !== entry.agentSessionId : item.id !== entry.id
          )),
        }));
      }}
    >
      <div
        className={cn(
          'flex items-start gap-3 rounded-md pl-3 pr-10 py-2.5 transition-colors',
          isActiveSession
            ? 'bg-claude-active/10'
            : 'hover:bg-muted cursor-pointer',
        )}
        onClick={isActiveSession ? undefined : onClick}
      >
        <span className="mt-1 shrink-0">
          {icon ?? (entry.cancelled
            ? <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
            : <CheckCircle2 className={cn('h-3.5 w-3.5', entry.dismissedAt ? 'text-muted-foreground' : 'text-muted-foreground/50')} />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
              <ProviderBadge providerId={entry.providerId} />
              <span className="truncate">{entry.workspaceName}</span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground/60">
              {formatNotificationTime(entry.completedAt)}
            </span>
          </div>
          {(title || entry.prompt) && (
            <p className={cn('mt-0.5 truncate text-sm', isActiveSession ? 'text-foreground' : 'text-muted-foreground')}>
              {stripMarkdown(title || entry.prompt || '')}
            </p>
          )}
          {entry.result && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/50">
              {stripMarkdown(entry.result)}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-muted-foreground/50">
            {durationText}
            {summaryText && ` · ${summaryText}`}
          </p>
        </div>
      </div>
    </SessionHistoryActions>
  );
};

const NotificationItem = ({
  item,
  variant,
  isActiveTab,
  onNavigate,
}: {
  item: INotificationItem;
  variant?: 'needs-input' | 'done' | 'pending';
  isActiveTab?: boolean;
  onNavigate?: (workspaceId: string, tabId: string) => void;
}) => {
  const t = useTranslations('notification');
  const action = item.currentAction;

  const renderAction = () => {
    if (!action) return t('starting');
    const IconComponent = action.toolName ? ACTION_ICONS[action.toolName] ?? Wrench : null;
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        {IconComponent && <IconComponent size={11} className="shrink-0 text-muted-foreground/40" />}
        <span className="truncate">{action.summary}</span>
      </span>
    );
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors',
        isActiveTab
          ? 'bg-claude-active/10'
          : 'hover:bg-muted cursor-pointer',
      )}
      onClick={isActiveTab ? undefined : () => onNavigate?.(item.workspaceId, item.tabId)}
    >
      <span className="mt-1 shrink-0">
        {variant === 'pending' ? (
          <Circle className="h-3.5 w-3.5 text-muted-foreground/50" />
        ) : variant === 'done' ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/50" />
        ) : variant === 'needs-input' ? (
          <span className="block h-2 w-2 rounded-full bg-ui-amber animate-pulse" />
        ) : (
          <Spinner className="h-3 w-3 text-claude-active/70" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-1 truncate text-xs text-muted-foreground">
            <ProviderBadge providerId={item.providerId} />
            <span className="truncate">{item.workspaceName}</span>
          </span>
          {(item.dismissedAt || item.readyForReviewAt || item.busySince) && (
            <span className="shrink-0 text-xs text-muted-foreground/60">
              {formatNotificationTime(item.dismissedAt ?? item.readyForReviewAt ?? item.busySince!)}
            </span>
          )}
        </div>
        {(item.title || item.lastUserMessage) && (
          <p className={cn('mt-0.5 truncate text-sm', isActiveTab ? 'text-foreground' : 'text-muted-foreground')}>
            {stripMarkdown(item.title || item.lastUserMessage || '')}
          </p>
        )}
        {variant === 'done' ? (
          item.lastAssistantMessage && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/50">
              {stripMarkdown(item.lastAssistantMessage)}
            </p>
          )
        ) : !variant && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground/60">
            {renderAction()}
          </p>
        )}

      </div>
    </div>
  );
};

export const NotificationPanel = ({ onNavigated, className }: { onNavigated?: () => void; className?: string }) => {
  const t = useTranslations('notification');
  const tabs = useTabStore((s) => s.tabs);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workflow = useWorkspaceStore((s) => s.sessionWorkflow);
  const historyEntries = useSessionHistoryStore((s) => s.entries);
  const { id: activeTabId, agentSessionId: activeSessionId, providerId: activeProviderId } = useActiveTab();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const { save, saving } = useSessionWorkflowMutation();
  const sessions = useMemo(() => collectWorkSessions(historyEntries, tabs, workflow), [historyEntries, tabs, workflow]);
  const handleNavigate = useCallback((workspaceId: string, tabId: string) => {
    navigateToTab(workspaceId, tabId);
    onNavigated?.();
  }, [onNavigated]);
  const toggleExpanded = (key: string) => setExpandedSessions((previous) => {
    const next = new Set(previous);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className={cn('flex-1 overflow-y-auto', className)} style={{ scrollbarWidth: 'none' }}>
      {sessions.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('empty')}</p>}
      {WORK_STATUSES.map((status) => {
        const items = sessions.filter((session) => session.status === status);
        if (!items.length) return null;
        const collapsed = workflow.collapsed[status] ?? false;
        return (
          <section key={status} className="mb-4">
            <button type="button" disabled={saving} aria-expanded={!collapsed}
              className="mb-2 flex w-full items-center gap-1 text-left text-xs font-medium text-muted-foreground"
              onClick={() => void save({ section: status, collapsed: !collapsed })}>
              <ChevronRight className={cn('h-3 w-3 transition-transform', !collapsed && 'rotate-90')} />
              {t('workStatus_' + status)} ({items.length})
            </button>
            {!collapsed && <div className="flex flex-col gap-2">
              {items.map((session) => {
                const entry = session.entry;
                const target = entry ?? session.navigation;
                const isActiveSession = target?.agentSessionId
                  ? target.agentSessionId === activeSessionId && target.providerId === activeProviderId
                  : !!session.live && session.tabId === activeTabId;
                const expanded = expandedSessions.has(session.key);
                const onClick = () => {
                  if (target) {
                    onNavigated?.();
                    void navigateToSession(target, session.live ? session.tabId : null);
                  } else handleNavigate(session.workspaceId, session.tabId);
                };
                const liveItem = <NotificationItem item={{
                  tabId: session.tabId, workspaceId: session.workspaceId,
                  workspaceName: target?.workspaceName ?? workspaces.find((ws) => ws.id === session.workspaceId)?.name ?? session.workspaceId,
                  providerId: target?.providerId ?? (session.key.startsWith('codex:') ? 'codex' : 'claude'),
                  agentSessionId: target?.agentSessionId,
                  lastUserMessage: session.live?.lastUserMessage,
                  title: session.live ? agentSessionTitle(tabs[session.tabId], workflow, session.tabId) : workflow.titles?.[session.key],
                  currentAction: session.live ? tabs[session.tabId]?.currentAction : null,
                  busySince: session.live ? tabs[session.tabId]?.busySince : null,
                }} variant={session.live?.cliState === 'needs-input' ? 'needs-input' : session.live?.cliState === 'busy' ? undefined : status === 'completed' ? 'done' : 'pending'}
                  isActiveTab={isActiveSession} onNavigate={onClick} />;
                return (
                  <div key={session.key}>
                    {entry && session.live?.cliState !== 'busy' && session.live?.cliState !== 'needs-input' ? <SessionHistoryItem entry={entry} title={session.live ? agentSessionTitle(tabs[session.tabId], workflow, session.tabId) : workflow.titles?.[session.key]} isActiveSession={isActiveSession} onClick={onClick}
                        icon={status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                          : status === 'review' ? <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                            : <Circle className="h-3.5 w-3.5 text-muted-foreground" />} />
                      : !entry && target?.agentSessionId
                        ? <SessionHistoryActions provider={target.providerId} sessionId={target.agentSessionId}
                          label={session.live?.lastUserMessage} onDeleted={async () => {
                            forgetSessionWorkflow(target.providerId, target.agentSessionId);
                          }}><div>{liveItem}</div></SessionHistoryActions>
                        : liveItem}
                    <div className="flex items-center gap-2 pl-9">
                      <select aria-label={t('workStatusLabel')} disabled={saving}
                        className="max-w-full rounded border bg-card px-1 py-0.5 text-xs text-muted-foreground"
                        value={workflow.statuses[session.key] ?? 'auto'}
                        onChange={(event) => void save({ key: session.key, status: event.target.value === 'auto' ? null : event.target.value as TWorkStatus })}>
                        <option value="auto">{t('workStatusAuto')}</option>
                        {WORK_STATUSES.map((value) => <option key={value} value={value}>{t('workStatus_' + value)}</option>)}
                      </select>
                      {session.live?.cliState === 'busy' && <span className="text-xs text-muted-foreground">{t('workRuntimeBusy')}</span>}
                      {session.live?.cliState === 'needs-input' && <span className="text-xs text-muted-foreground">{t('needsInputSection', { count: 1 })}</span>}
                    </div>
                    {session.olderEntries.length > 0 && <>
                      <button type="button" aria-expanded={expanded}
                        className="mt-1 flex items-center gap-1 pl-9 text-xs text-muted-foreground"
                        onClick={() => toggleExpanded(session.key)}>
                        <ChevronRight className={cn('h-3 w-3', expanded && 'rotate-90')} />
                        {expanded ? t('showLess') : t('showMore', { count: session.olderEntries.length })}
                      </button>
                      {expanded && <div className="ml-5 border-l pl-2">
                        {session.olderEntries.map((older) => <SessionHistoryItem key={older.id} entry={older} compact
                          onClick={() => { onNavigated?.(); void navigateToSession(older, session.live ? session.tabId : null); }} />)}
                      </div>}
                    </>}
                  </div>
                );
              })}
            </div>}
          </section>
        );
      })}
    </div>
  );
};

const NotificationSheet = ({ open, onOpenChange }: INotificationSheetProps) => {
  const t = useTranslations('notification');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" showCloseButton={false} className="w-80 sm:max-w-80">
        <div className="h-titlebar shrink-0" />
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
        </SheetHeader>
        <NotificationPanel onNavigated={() => onOpenChange(false)} className="px-4 pb-4" />
      </SheetContent>
    </Sheet>
  );
};

export default NotificationSheet;
