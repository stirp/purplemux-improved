import { useRef, useEffect, useMemo } from 'react';
import useTabStore, { selectTabDisplayStatus } from '@/hooks/use-tab-store';
import { cn } from '@/lib/utils';
import CompactTabIcon from '@/components/features/workspace/compact-tab-icon';
import type { IWorkspace, IPaneNode, TPanelType } from '@/types/terminal';
import useTouchDrag from '@/hooks/use-touch-drag';
import useNavigationDrag, { reorderNavigationIds } from '@/hooks/use-navigation-drag';

interface IMobileWorkspaceTabBarProps {
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  workspaceLayouts: Record<string, IPaneNode[]>;
  selectedPaneId: string | null;
  selectedTabId: string | null;
  onSelect: (workspaceId: string, paneId: string, tabId: string) => void;
  onReorderTabs: (workspaceId: string, paneId: string, tabIds: string[]) => Promise<void>;
}

interface ITabDot {
  workspaceId: string;
  paneId: string;
  tabId: string;
  panelType?: TPanelType;
}

const MobileWorkspaceTabBar = ({
  workspaces,
  activeWorkspaceId,
  workspaceLayouts,
  selectedPaneId,
  selectedTabId,
  onSelect,
  onReorderTabs,
}: IMobileWorkspaceTabBarProps) => {
  const activeRef = useRef<HTMLButtonElement>(null);
  const onTouchDragStart = useTouchDrag();
  const dragProps = useNavigationDrag((source, target, after) => {
    if (source.kind !== 'tab' || target.kind !== 'tab') return;
    const pane = workspaceLayouts[source.workspaceId]?.find((item) => item.id === source.paneId);
    if (!pane) return;
    const ids = [...pane.tabs].sort((a, b) => a.order - b.order).map((tab) => tab.id);
    void onReorderTabs(source.workspaceId, source.paneId, reorderNavigationIds(ids, source.id, target.id, after));
  }, 'x');
  const statusTabs = useTabStore((s) => s.tabs);
  const items = useMemo(() => {
    const result: (ITabDot | 'divider')[] = [];

    for (const ws of workspaces) {
      const panes = workspaceLayouts[ws.id] ?? [];
      const wsTabs: ITabDot[] = [];

      for (const pane of panes) {
        const sorted = [...pane.tabs].sort((a, b) => a.order - b.order);
        for (const tab of sorted) {
          wsTabs.push({ workspaceId: ws.id, paneId: pane.id, tabId: tab.id, panelType: tab.panelType });
        }
      }

      if (wsTabs.length > 0) {
        if (result.length > 0) result.push('divider');
        result.push(...wsTabs);
      }
    }

    return result;
  }, [workspaces, workspaceLayouts]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [selectedTabId]);

  const totalTabs = items.filter((i) => i !== 'divider').length;
  if (totalTabs === 0) return null;

  return (
    <div className="shrink-0 border-t bg-background">
      <div
        className="flex h-10 items-center justify-center overflow-x-auto px-4"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
        onTouchStartCapture={onTouchDragStart}
      >
        {items.map((item, i) => {
          if (item === 'divider') {
            return (
              <span
                key={`d-${i}`}
                className="mx-0.5 h-3 w-px shrink-0 bg-border"
              />
            );
          }

          const isActive =
            item.workspaceId === activeWorkspaceId &&
            item.paneId === selectedPaneId &&
            item.tabId === selectedTabId;
          const status = selectTabDisplayStatus(statusTabs, item.tabId);
          const termStatus = statusTabs[item.tabId]?.terminalStatus;
          const currentProcess = statusTabs[item.tabId]?.currentProcess;


          return (
            <button
              key={item.tabId}
              {...dragProps({ kind: 'tab', id: item.tabId, workspaceId: item.workspaceId, paneId: item.paneId })}
              onContextMenu={(event) => event.preventDefault()}
              ref={isActive ? activeRef : undefined}
              className="flex h-8 w-8 shrink-0 items-center justify-center"
              onClick={() => onSelect(item.workspaceId, item.paneId, item.tabId)}
              aria-current={isActive ? 'true' : undefined}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full',
                  isActive && 'bg-foreground/15',
                )}
              >
                <CompactTabIcon panelType={item.panelType} status={status} terminalStatus={termStatus} process={currentProcess} />
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  );
};

export default MobileWorkspaceTabBar;
