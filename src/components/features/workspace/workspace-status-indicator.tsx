import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { collectWorkSessions, aggregateWorkStatus } from '@/lib/session-workflow';
import useTabStore, { selectTabDisplayStatus } from '@/hooks/use-tab-store';
import type { ITab } from '@/types/terminal';
import CompactTabIcon from './compact-tab-icon';

interface IWorkspaceStatusIndicatorProps {
  workspaceId: string;
  tabs?: ITab[];
}

const WorkspaceStatusIndicator = ({ workspaceId, tabs: layoutTabs }: IWorkspaceStatusIndicatorProps) => {
  const t = useTranslations('terminal');
  const tw = useTranslations('notification');
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
