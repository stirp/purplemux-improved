import { useMemo, useCallback, useState, useRef, useId } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTranslations } from 'next-intl';
import {
  Circle,
  Clock3,
  CheckCircle2,
  ChevronRight,
  Folder,
  FileText,
  FilePen,
  FilePlus,
  Terminal,
  Search,
  Users,
  Wrench,
  XCircle,
  X,
} from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import type { IPaneNode } from '@/types/terminal';
import type { ISessionHistoryEntry, TSessionHistoryProvider } from '@/types/session-history';
import { stripMarkdown } from '@/lib/strip-markdown';
import { agentTabTitle } from '@/lib/agent-session-title';
import { searchSessions } from '@/lib/session-search';
import { sessionRootWorkspaceName, sessionWorkspaceName } from '@/lib/session-workspace-name';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import OpenAIIcon from '@/components/icons/openai-icon';
import SessionHistoryActions from '@/components/features/workspace/session-history-actions';
import useWorkspaceLayouts from '@/hooks/use-workspace-layouts';
import { toast } from 'sonner';
import { sessionTagIds } from '@/lib/session-tags';
import { SessionTagChips, SessionTagToolbar } from '@/components/features/workspace/session-tag-controls';
import { SessionTagEditor, SessionTagManager, type ITagEditorSession } from '@/components/features/workspace/session-tag-dialogs';

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
  rootWorkspaceName: string;
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

const SessionProjectName = ({ name, rootName }: { name: string; rootName: string }) => {
  const t = useTranslations('notification');
  return (
    <div className="mb-2 text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
      <Folder aria-hidden="true" className="mr-1 inline size-3 align-[-2px]" />
      <span data-root-project={rootName}>
        <span className="sr-only">{t('rootProjectLabel')}: </span>{rootName}
      </span>
      <ChevronRight aria-hidden="true" className="mx-1 inline size-3 align-[-2px]" />
      <span className="text-foreground/75" title={name}>
        <span className="sr-only">{t('projectLabel')}: </span>{name}
      </span>
    </div>
  );
};

const SessionTitle = ({ providerId, title, icon }: { providerId: TSessionHistoryProvider; title: string; icon?: React.ReactNode }) => (
  <div className="flex items-start gap-2">
    <span className="mt-1 shrink-0">{icon}</span>
    <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground [overflow-wrap:anywhere]">{stripMarkdown(title)}</p>
    <span className="mt-0.5 shrink-0"><ProviderBadge providerId={providerId} /></span>
  </div>
);

const SessionHistoryItem = ({
  entry,
  workspaceName,
  rootWorkspaceName,
  title,
  isActiveSession,
  compact,
  showResult,
  icon,
  onClick,
}: {
  entry: ISessionHistoryEntry;
  workspaceName: string;
  rootWorkspaceName: string;
  title?: string | null;
  isActiveSession?: boolean;
  compact?: boolean;
  showResult?: boolean;
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
      <button
        type="button"
        className="block w-full min-w-0 px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
        onClick={onClick}
      >
        <SessionProjectName name={workspaceName} rootName={rootWorkspaceName} />
        <SessionTitle providerId={entry.providerId} title={title || entry.prompt || t('untitledSession')} />
        {entry.prompt && entry.prompt !== title && <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{stripMarkdown(entry.prompt)}</p>}
        {showResult && entry.result && (
          <p className="mt-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{stripMarkdown(entry.result)}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {formatNotificationTime(entry.completedAt)} · {durationText}
          {summaryText && ` · ${summaryText}`}
        </p>
      </button>
    );
  }

  return (
    <SessionHistoryActions
      actionClassName="right-0 top-0 flex size-11 translate-y-0 items-center justify-center"
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
      <button
        type="button"
        data-session-navigation
        aria-current={isActiveSession ? 'true' : undefined}
        className="block w-full min-w-0 px-3 pb-2 pt-3 pr-12 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
        onClick={isActiveSession ? undefined : onClick}
      >
        <SessionProjectName name={workspaceName} rootName={rootWorkspaceName} />
        <SessionTitle providerId={entry.providerId} title={title || entry.prompt || t('untitledSession')}
          icon={icon ?? (entry.cancelled
            ? <XCircle className="size-3.5 text-muted-foreground" />
            : <CheckCircle2 className="size-3.5 text-muted-foreground" />)} />
        {entry.result && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{stripMarkdown(entry.result)}</p>}
        <p className="mt-2 flex flex-wrap gap-x-1 text-xs text-muted-foreground">
          <span>{formatNotificationTime(entry.completedAt)} · {durationText}</span>
          {summaryText && <span>· {summaryText}</span>}
        </p>
      </button>
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
    <button
      type="button"
      data-session-navigation
      aria-current={isActiveTab ? 'true' : undefined}
      className="block w-full min-w-0 px-3 pb-2 pt-3 pr-12 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
      onClick={isActiveTab ? undefined : () => onNavigate?.(item.workspaceId, item.tabId)}
    >
      <SessionProjectName name={item.workspaceName} rootName={item.rootWorkspaceName} />
      <SessionTitle providerId={item.providerId} title={item.title || item.lastUserMessage || t('untitledSession')}
        icon={variant === 'pending' ? <Circle className="size-3.5 text-muted-foreground" />
          : variant === 'done' ? <CheckCircle2 className="size-3.5 text-muted-foreground" />
            : variant === 'needs-input' ? <span className="block size-2 rounded-full bg-ui-amber" />
              : <Spinner className="size-3.5 text-claude-active" />} />
      {variant === 'done' ? item.lastAssistantMessage && (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">{stripMarkdown(item.lastAssistantMessage)}</p>
      ) : !variant && <p className="mt-1 truncate text-xs text-muted-foreground">{renderAction()}</p>}
      {(item.dismissedAt || item.readyForReviewAt || item.busySince) && (
        <p className="mt-2 text-xs text-muted-foreground">{formatNotificationTime(item.dismissedAt ?? item.readyForReviewAt ?? item.busySince!)}</p>
      )}
    </button>
  );
};

interface INotificationPanelProps {
  workspaceLayouts: Record<string, IPaneNode[]>;
  onNavigated?: () => void;
  className?: string;
}

export const NotificationPanel = ({ workspaceLayouts, onNavigated, className }: INotificationPanelProps) => {
  const t = useTranslations('notification');
  const tt = useTranslations('notification.tags');
  const tabs = useTabStore((s) => s.tabs);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workflow = useWorkspaceStore((s) => s.sessionWorkflow);
  const historyEntries = useSessionHistoryStore((s) => s.entries);
  const { id: activeTabId, agentSessionId: activeSessionId, providerId: activeProviderId } = useActiveTab();
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [tagSelection, setTagSelection] = useState<string[]>([]);
  const [tagEditor, setTagEditor] = useState<ITagEditorSession | null>(null);
  const [tagManager, setTagManager] = useState(false);
  const tags = workflow.tags ?? [];
  const tagFilters = tagSelection.filter((id) => tags.some((tag) => tag.id === id));
  const searchInput = useRef<HTMLInputElement>(null);
  const searchHintId = useId();
  const searching = query.trim().length > 0;
  const filtering = searching || tagFilters.length > 0;
  const { save, saving } = useSessionWorkflowMutation();
  const sessions = useMemo(() => collectWorkSessions(historyEntries, tabs, workflow), [historyEntries, tabs, workflow]);
  const searchItems = useMemo(() => sessions.map((session) => {
    const workspace = workspaces.find((ws) => ws.id === session.workspaceId);
    const tab = session.live ? tabs[session.tabId] : undefined;
    const layoutTab = tab ? workspaceLayouts[session.workspaceId]?.flatMap((pane) => pane.tabs).find((item) => item.id === session.tabId) : undefined;
    const title = tab
      ? agentTabTitle(layoutTab?.name ?? '', tab, workflow, session.tabId) || layoutTab?.title || tab.tabName
      : workflow.titles?.[session.key];
    return {
      session,
      title: title || session.entry?.prompt || t('untitledSession'),
      rootWorkspaceName: sessionRootWorkspaceName(session, workspaces) ?? t('unknownRootProject'),
      workspaceName: sessionWorkspaceName(session, workspace) ?? t('unknownWorkspace'),
      workspaceDirectories: workspace?.directories,
    };
  }), [sessions, tabs, workflow, workspaces, workspaceLayouts, t]);
  const matchedItems = useMemo(() => searchSessions(searchItems, query), [searchItems, query]);
  const visibleItems = matchedItems.filter(({ session }) => tagFilters.every((id) => sessionTagIds(workflow, session).includes(id)));
  const tagCounts: Record<string, number> = {};
  for (const session of sessions) for (const id of sessionTagIds(workflow, session)) tagCounts[id] = (tagCounts[id] ?? 0) + 1;
  const clearSearch = () => {
    setQuery('');
    searchInput.current?.focus();
  };
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
    <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>
      <div className="shrink-0 pb-3">
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input ref={searchInput} type="search" value={query} aria-label={t('searchPlaceholder')}
            aria-describedby={searchHintId} placeholder={t('searchPlaceholder')}
            className="min-h-11 pl-9 pr-11 text-base md:min-h-8 md:text-sm [&::-webkit-search-cancel-button]:hidden"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.stopPropagation();
                clearSearch();
              }
            }} />
          {query && <Button type="button" variant="ghost" size="icon" aria-label={t('searchClear')}
            className="absolute right-0 top-0 size-11 md:size-8" onClick={clearSearch}><X aria-hidden="true" /></Button>}
        </div>
        <p id={searchHintId} className="mt-1.5 text-xs text-muted-foreground">{t('searchHint')}</p>
        <SessionTagToolbar tags={tags} selected={tagFilters} onChange={setTagSelection} onManage={() => setTagManager(true)} counts={tagCounts} />
        <div role="status" aria-live="polite" aria-atomic="true" className="text-xs text-muted-foreground">
          {filtering && <p className="mt-1.5">{t('searchCount', { count: visibleItems.length })}</p>}
        </div>
        {filtering && <Button variant="ghost" size="xs" className="mt-1 min-h-11 text-xs text-muted-foreground md:min-h-8" onClick={() => { clearSearch(); setTagSelection([]); }}>{tt('clearAll')}</Button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>
        {visibleItems.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t(filtering ? 'searchEmpty' : 'empty')}</p>}
        {WORK_STATUSES.map((status) => {
          const items = visibleItems.filter(({ session }) => session.status === status);
          if (!items.length) return null;
          const collapsed = !filtering && (workflow.collapsed[status] ?? false);
          return (
            <section key={status} className="mb-4">
              <button type="button" disabled={saving || filtering} aria-expanded={!collapsed}
                className="mb-1 flex min-h-11 w-full items-center gap-2 text-left text-xs font-medium text-muted-foreground md:min-h-8"
                onClick={() => void save({ section: status, collapsed: !collapsed })}>
                <ChevronRight className={cn('h-3 w-3 transition-transform', !collapsed && 'rotate-90')} />
                {t('workStatus_' + status)} <span className="ml-auto tabular-nums">{items.length}</span>
              </button>
              {!collapsed && <div className="flex flex-col gap-2">
                {items.map(({ session, title, workspaceName, rootWorkspaceName }) => {
                  const entry = session.entry;
                  const target = entry ?? session.navigation;
                  const isActiveSession = target?.agentSessionId
                    ? target.agentSessionId === activeSessionId && target.providerId === activeProviderId
                    : !!session.live && session.tabId === activeTabId;
                  const expanded = searching || expandedSessions.has(session.key);
                  const onClick = () => {
                    if (target) {
                      onNavigated?.();
                      void navigateToSession(target, session.live ? session.tabId : null);
                    } else handleNavigate(session.workspaceId, session.tabId);
                  };
                  const liveItem = <NotificationItem item={{
                    tabId: session.tabId, workspaceId: session.workspaceId,
                    workspaceName, rootWorkspaceName: rootWorkspaceName ?? t('unknownRootProject'),
                    providerId: target?.providerId ?? (session.key.startsWith('codex:') ? 'codex' : 'claude'),
                    agentSessionId: target?.agentSessionId,
                    lastUserMessage: session.live?.lastUserMessage,
                    title,
                    currentAction: session.live ? tabs[session.tabId]?.currentAction : null,
                    busySince: session.live ? tabs[session.tabId]?.busySince : null,
                  }} variant={session.live?.cliState === 'needs-input' ? 'needs-input' : session.live?.cliState === 'busy' ? undefined : status === 'completed' ? 'done' : 'pending'}
                    isActiveTab={isActiveSession} onNavigate={onClick} />;
                  return (
                    <div key={session.key} className={cn('min-w-0 overflow-hidden rounded-lg border', isActiveSession ? 'border-claude-active/30 bg-claude-active/5' : 'border-border/60 bg-card')}>
                      {entry && session.live?.cliState !== 'busy' && session.live?.cliState !== 'needs-input' ? <SessionHistoryItem entry={entry} workspaceName={workspaceName} rootWorkspaceName={rootWorkspaceName ?? t('unknownRootProject')} title={title} isActiveSession={isActiveSession} onClick={onClick}
                          icon={status === 'completed' ? <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />
                            : status === 'review' ? <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
                              : <Circle className="h-3.5 w-3.5 text-muted-foreground" />} />
                        : !entry && target?.agentSessionId
                          ? <SessionHistoryActions provider={target.providerId} sessionId={target.agentSessionId}
                            actionClassName="right-0 top-0 flex size-11 translate-y-0 items-center justify-center"
                            label={session.live?.lastUserMessage} onDeleted={async () => {
                              forgetSessionWorkflow(target.providerId, target.agentSessionId);
                            }}><div>{liveItem}</div></SessionHistoryActions>
                          : liveItem}
                      <SessionTagChips title={title || t('untitledSession')} tags={sessionTagIds(workflow, session).flatMap((id) => tags.filter((tag) => tag.id === id))}
                        onFilter={(id) => setTagSelection([id])} onEdit={() => setTagEditor({ key: session.key, title: title || t('untitledSession'), ids: sessionTagIds(workflow, session), revision: workflow.tagsRevision ?? 0 })} />
                      <div className="flex flex-wrap items-center gap-x-2 border-t border-border/40 px-3 py-1">
                        <select aria-label={t('workStatusLabel')} disabled={saving}
                          className="min-h-11 min-w-0 max-w-full rounded-md border border-border/60 bg-transparent px-2 text-xs text-muted-foreground md:min-h-8"
                          value={workflow.statuses[session.key] ?? 'auto'}
                          onChange={(event) => void save({ key: session.key, status: event.target.value === 'auto' ? null : event.target.value as TWorkStatus })}>
                          <option value="auto">{t('workStatusAuto')}</option>
                          {WORK_STATUSES.map((value) => <option key={value} value={value}>{t('workStatus_' + value)}</option>)}
                        </select>
                        {session.live?.cliState === 'busy' && <span className="text-xs text-muted-foreground">{t('workRuntimeBusy')}</span>}
                        {session.live?.cliState === 'needs-input' && <span className="text-xs text-muted-foreground">{t('needsInputSection', { count: 1 })}</span>}
                        {session.olderEntries.length > 0 && <button type="button" aria-expanded={expanded} disabled={searching}
                          className="ml-auto flex min-h-11 items-center gap-1 text-xs text-muted-foreground md:min-h-8"
                          onClick={() => toggleExpanded(session.key)}>
                          <ChevronRight className={cn('h-3 w-3', expanded && 'rotate-90')} />
                          {expanded && !searching ? t('showLess') : t('showMore', { count: session.olderEntries.length })}
                        </button>}
                      </div>
                      {session.olderEntries.length > 0 && expanded && <div className="mx-3 mb-2 border-l border-border pl-2">
                          {session.olderEntries.map((older) => <SessionHistoryItem key={older.id} entry={older} workspaceName={workspaceName} rootWorkspaceName={rootWorkspaceName ?? t('unknownRootProject')} title={title} compact showResult={searching}
                            onClick={() => { onNavigated?.(); void navigateToSession(older, session.live ? session.tabId : null); }} />)}
                      </div>}
                    </div>
                  );
                })}
              </div>}
            </section>
          );
        })}
      </div>
      {tagEditor && <SessionTagEditor session={tagEditor} workflow={workflow} onClose={() => setTagEditor(null)} onSaved={(ids) => {
        setTagEditor(null);
        toast.success(tt(tagFilters.some((id) => !ids.includes(id)) ? 'savedOutsideFilter' : 'saved'));
      }} />}
      {tagManager && <SessionTagManager workflow={workflow} counts={tagCounts} onClose={() => setTagManager(false)} />}
    </div>
  );
};

const StandaloneNotificationPanel = ({ onNavigated }: { onNavigated: () => void }) => {
  const workspaceLayouts = useWorkspaceLayouts();
  return <NotificationPanel workspaceLayouts={workspaceLayouts} onNavigated={onNavigated} className="px-4 pb-4" />;
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
        {open && <StandaloneNotificationPanel onNavigated={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
};

export default NotificationSheet;
