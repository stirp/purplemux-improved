import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Check, CircleDot, CircleHelp, Clock3, Loader2, MessageCircleQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { collectWorkSessions, aggregateWorkStatus } from '@/lib/session-workflow';
import useTabStore, { selectTabDisplayStatus } from '@/hooks/use-tab-store';
import type { ITab } from '@/types/terminal';
import CompactTabIcon from '@/components/features/workspace/compact-tab-icon';

interface IWorkspaceStatusIndicatorProps {
  workspaceId: string;
  tabs?: ITab[];
  compact?: boolean;
}

const WorkspaceStatusIndicator = ({ workspaceId, tabs: layoutTabs, compact = false }: IWorkspaceStatusIndicatorProps) => {
  const t = useTranslations('terminal');
  const tw = useTranslations('notification');
  const ts = useTranslations('sidebar');
  const workflow = useWorkspaceStore((state) => state.sessionWorkflow);
  const entries = useSessionHistoryStore((state) => state.entries);
  const wsConnected = useTabStore((state) => state.statusWsConnected);
  const tabs = useTabStore((state) => state.tabs);
  const tabOrder = useTabStore((state) => state.tabOrders[workspaceId]);
  const tabEntries = useMemo(() => {
    if (layoutTabs) {
      return layoutTabs.map((tab) => ({
        tabId: tab.id,
        status: selectTabDisplayStatus(tabs, tab.id),
        panelType: tab.panelType ?? tabs[tab.id]?.panelType,
        terminalStatus: tabs[tab.id]?.terminalStatus,
        currentProcess: tabs[tab.id]?.currentProcess,
      }));
    }

    const wsTabIds = new Set<string>();
    for (const [tabId, entry] of Object.entries(tabs)) {
      if (entry.workspaceId === workspaceId) wsTabIds.add(tabId);
    }

    const ordered = (tabOrder ?? []).filter((id) => wsTabIds.has(id));
    for (const id of wsTabIds) {
      if (!ordered.includes(id)) ordered.push(id);
    }

    return ordered.map((tabId) => ({
      tabId,
      status: selectTabDisplayStatus(tabs, tabId),
      panelType: tabs[tabId]?.panelType,
      terminalStatus: tabs[tabId]?.terminalStatus,
      currentProcess: tabs[tabId]?.currentProcess,
    }));
  }, [tabs, tabOrder, workspaceId, layoutTabs]);

  const workStatus = useMemo(() => aggregateWorkStatus(collectWorkSessions(entries, tabs, workflow)
    .filter((session) => session.workspaceId === workspaceId).map((session) => session.status)), [entries, tabs, workflow, workspaceId]);

  if (compact) {
    const agents = tabEntries.filter(({ panelType }) => panelType === 'claude-code' || panelType === 'codex-cli');
    const needsInput = wsConnected && agents.some(({ status }) => status === 'needs-input');
    const busy = wsConnected && agents.some(({ status }) => status === 'busy');
    const unknown = agents.length > 0 && (!wsConnected || agents.some(({ status }) => status === 'unknown'));
    if (workStatus === 'pending' && !needsInput && !busy && !unknown) return null;

    const label = needsInput ? ts('statusNeedsInput') : unknown ? ts('statusUnknown')
      : busy ? ts('statusBusy') : tw('workStatus_' + workStatus);
    const Icon = needsInput ? MessageCircleQuestion : unknown ? CircleHelp : busy ? Loader2
      : workStatus === 'review' ? Clock3 : workStatus === 'completed' ? Check : CircleDot;
    const color = needsInput ? 'bg-ui-amber/15 text-ui-amber' : unknown ? 'text-muted-foreground'
      : busy ? 'text-ui-blue' : workStatus === 'review' ? 'bg-ui-amber/15 text-ui-amber'
        : workStatus === 'completed' ? 'text-ui-green' : 'text-ui-blue';
    const title = [label, `${tw('workStatusLabel')}: ${tw('workStatus_' + workStatus)}`, busy && ts('statusBusy')].filter(Boolean).join('\n');
    return <span className={cn('workspace-compact-status inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] leading-normal', color)} role="img" aria-label={title} title={title}>
      <Icon aria-hidden="true" className={cn('h-3 w-3 shrink-0', busy && !needsInput && !unknown && 'animate-spin motion-reduce:animate-none')} />
      {workStatus !== 'completed' || needsInput || busy || unknown
        ? <span className="workspace-status-label whitespace-nowrap">{label}</span> : null}
    </span>;
  }

  return (
    <span className="mt-1 flex h-4 items-center gap-1" aria-label={t('tabStatus')}>
      <span className="text-[10px] text-muted-foreground" aria-label={tw('workStatusLabel')}>{tw('workStatus_' + workStatus)}</span>
      {(!wsConnected || tabEntries.length > 0) && tabEntries.map(({ tabId, status, panelType, terminalStatus, currentProcess }) => (
        <CompactTabIcon key={tabId} status={status} panelType={panelType} terminalStatus={terminalStatus} process={currentProcess} />
      ))}
    </span>
  );
};

export default memo(WorkspaceStatusIndicator);
