import { memo, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import useTabStore, { selectTabDisplayStatus } from '@/hooks/use-tab-store';
import type { ITab } from '@/types/terminal';
import CompactTabIcon from './compact-tab-icon';

interface IWorkspaceStatusIndicatorProps {
  workspaceId: string;
  tabs?: ITab[];
}

const WorkspaceStatusIndicator = ({ workspaceId, tabs: layoutTabs }: IWorkspaceStatusIndicatorProps) => {
  const t = useTranslations('terminal');
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

  if (wsConnected && tabEntries.length === 0) return null;

  return (
    <span className="mt-1 flex h-4 items-center gap-1" aria-label={t('tabStatus')}>
      {tabEntries.map(({ tabId, status, panelType, terminalStatus, currentProcess }) => (
        <CompactTabIcon key={tabId} status={status} panelType={panelType} terminalStatus={terminalStatus} process={currentProcess} />
      ))}
    </span>
  );
};

export default memo(WorkspaceStatusIndicator);
