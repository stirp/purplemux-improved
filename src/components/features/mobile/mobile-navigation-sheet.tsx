import { useMemo, useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  CornerDownRight,
  Folder,
  GitBranch,
  FolderPlus,
  GitCompareArrows,
  Globe,
  Plus,
  Settings,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import OpenAIIcon from '@/components/icons/openai-icon';
import { useRouter } from 'next/router';
import useSidebarItems from '@/hooks/use-sidebar-items';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import IconRenderer from '@/components/features/settings/icon-renderer';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNotificationCount, NotificationPanel } from '@/components/features/workspace/notification-sheet';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { IWorkspace, IWorkspaceGroup, IPaneNode, ITab, TPanelType } from '@/types/terminal';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import useTabStore, { selectWorkspacePortsLabel } from '@/hooks/use-tab-store';
import { formatTabTitle } from '@/lib/tab-title';
import ProcessIcon from '@/components/icons/process-icon';
import TabStatusIndicator from '@/components/features/workspace/tab-status-indicator';
import WorkspaceStatusIndicator from '@/components/features/workspace/workspace-status-indicator';
import SidebarRateLimits from '@/components/layout/sidebar-rate-limits';
import MobileWorkspaceGroupHeader from '@/components/features/mobile/mobile-workspace-group-header';
import RenameGroupDialog from '@/components/features/workspace/rename-group-dialog';
import MobileWorkspaceActions from './mobile-workspace-actions';
import { getVisuallyOrderedWorkspaces, getWorkspaceVisibility } from '@/lib/workspace-order';
import useTouchDrag from '@/hooks/use-touch-drag';
import useNavigationDrag, { reorderNavigationIds } from '@/hooks/use-navigation-drag';

const WorkspacePortsLabel = ({ workspaceId }: { workspaceId: string }) => {
  const label = useTabStore(
    (state) => selectWorkspacePortsLabel(state.tabs, workspaceId),
  );
  if (!label) return null;
  return <span className="mt-1 block truncate text-xs text-ui-green/80">{label}</span>;
};

interface IMobileNavigationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  workspaceLayouts: Record<string, IPaneNode[]>;
  activePaneId: string | null;
  activeTabId: string | null;
  onSelectSurface: (workspaceId: string, paneId: string, tabId: string) => void;
  onCreateWorkspace: () => Promise<void>;
  onOpenSettings: () => void;
  onReorderTabs: (workspaceId: string, paneId: string, tabIds: string[]) => Promise<void>;
}

const MobileNavigationSheet = ({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
  workspaceLayouts,
  activePaneId,
  activeTabId,
  onSelectSurface,
  onCreateWorkspace,
  onOpenSettings,
  onReorderTabs,
}: IMobileNavigationSheetProps) => {
  const t = useTranslations('mobile');
  const tt = useTranslations('terminal');
  const tc = useTranslations('common');
  const ts = useTranslations('sidebar');
  const router = useRouter();
  const mobileTab = useWorkspaceStore((s) => s.sidebarTab);
  const groups = useWorkspaceStore((s) => s.groups);

  const handleMobileTabChange = useCallback((v: string) => {
    useWorkspaceStore.getState().setSidebarTab(v as 'workspace' | 'sessions');
  }, []);
  const { attentionCount, busyCount } = useNotificationCount();
  const sessionsBadge = attentionCount + busyCount;
  const [expandedWsId, setExpandedWsId] = useState<string | null>(activeWorkspaceId);
  const workspaceVisibility = useMemo(
    () => getWorkspaceVisibility(workspaces, expandedWsId),
    [workspaces, expandedWsId],
  );
  const [renameGroupId, setRenameGroupId] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setExpandedWsId(activeWorkspaceId);
  }
  const onTouchDragStart = useTouchDrag();
  const dragProps = useNavigationDrag((source, target, after) => {
    if (source.kind === 'workspace' && target.kind === 'workspace') {
      const store = useWorkspaceStore.getState();
      const ids = store.workspaces.map((ws) => ws.id);
      const ordered = reorderNavigationIds(ids, source.id, target.id, after);
      const destination = store.workspaces.find((ws) => ws.id === target.id);
      if (destination) store.reorderWorkspaces(ids.indexOf(source.id), ordered.indexOf(source.id), destination.groupId ?? null);
    } else if (source.kind === 'tab' && target.kind === 'tab') {
      const pane = workspaceLayouts[source.workspaceId]?.find((item) => item.id === source.paneId);
      if (!pane) return;
      const ids = [...pane.tabs].sort((a, b) => a.order - b.order).map((tab) => tab.id);
      void onReorderTabs(source.workspaceId, source.paneId, reorderNavigationIds(ids, source.id, target.id, after));
    }
  });
  const metadata = useTabMetadataStore((s) => s.metadata);
  const { items: sidebarItems } = useSidebarItems();

  const handleToggleGroup = useCallback((groupId: string) => {
    useWorkspaceStore.getState().toggleGroupCollapsed(groupId);
  }, []);

  const handleRenameGroupRequest = useCallback((groupId: string) => {
    setRenameGroupId(groupId);
  }, []);

  const handleUngroupGroup = useCallback((groupId: string) => {
    useWorkspaceStore.getState().ungroupGroup(groupId);
  }, []);

  const handleCreateGroup = useCallback(async () => {
    const defaultName = ts('defaultGroupName');
    await useWorkspaceStore.getState().createGroup(defaultName);
  }, [ts]);

  const handleToggleWorkspace = useCallback(
    (workspaceId: string) => {
      setExpandedWsId((prev) => (prev === workspaceId ? null : workspaceId));
    },
    [],
  );

  const handleSheetOpenChange = useCallback(
    (v: boolean) => {
      onOpenChange(v);
      if (v) setExpandedWsId(activeWorkspaceId);
    },
    [onOpenChange, activeWorkspaceId],
  );

  const getTabDisplayName = (tab: ITab) => {
    if (tab.name) return tab.name;
    if (tab.panelType === 'agent-sessions') return tt('sessionList');
    const meta = metadata[tab.id];
    const rawTitle = meta?.title || tab.title;
    const formatted = rawTitle ? formatTabTitle(rawTitle, tab.panelType) : '';
    if (formatted) return formatted;
    return '';
  };

  const tabs = useTabStore((s) => s.tabs);

  const getTabProcess = (tab: ITab) => tabs[tab.id]?.currentProcess;

  const getTabAgentSummary = (tab: ITab, panelType: TPanelType): string | null => {
    if (panelType !== 'claude-code' && panelType !== 'codex-cli') return null;

    const liveState = tabs[tab.id];
    const clean = (value: string | null | undefined): string | null => {
      const text = value?.trim();
      return text ? text : null;
    };

    const liveSummary = clean(liveState?.agentSummary);
    if (liveSummary) return liveSummary;

    const agentSummary =
      tab.agentState &&
      ((panelType === 'claude-code' && tab.agentState.providerId === 'claude') ||
        (panelType === 'codex-cli' && tab.agentState.providerId === 'codex'))
        ? clean(tab.agentState.summary)
        : null;
    return agentSummary
      ?? clean(panelType === 'claude-code' ? tab.claudeSummary : null)
      ?? clean(liveState?.lastUserMessage)
      ?? clean(tab.lastUserMessage);
  };

  const getTabNerdColor = (tab: ITab) => {
    const terminalStatus = tabs[tab.id]?.terminalStatus;
    if (terminalStatus === 'server') return 'text-ui-green';
    if (terminalStatus === 'running') return 'text-ui-blue';
    return 'text-muted-foreground/50';
  };

  const renderSurfaceItem = (workspaceId: string, pane: IPaneNode, tab: ITab, indent: string) => {
    const isCurrentWs = workspaceId === activeWorkspaceId;
    const isTabActive = isCurrentWs && pane.id === activePaneId && tab.id === activeTabId;
    const panelType = tab.panelType ?? 'terminal';
    const agentSummary = getTabAgentSummary(tab, panelType);

    return (
      <div key={tab.id} className="relative flex items-center">
        <button
          className={cn(
            'flex w-full select-none items-center gap-2 py-2.5 pr-4 text-left text-sm transition-colors',
            indent,
            isTabActive
              ? 'bg-accent font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent/50',
          )}
          onClick={() => {
            onSelectSurface(workspaceId, pane.id, tab.id);
          }}
          {...dragProps({ kind: 'tab', id: tab.id, workspaceId, paneId: pane.id })}
          onContextMenu={(e) => e.preventDefault()}
        >
          <TabStatusIndicator
            tabId={tab.id}
            panelType={panelType}
          />
          <span className="mt-0.5 flex w-4 shrink-0 items-center justify-center">
            {panelType === 'claude-code' ? (
              <ClaudeCodeIcon size={16} />
            ) : panelType === 'codex-cli' ? (
              <OpenAIIcon size={16} className="text-foreground" />
            ) : panelType === 'web-browser' ? (
              <Globe size={14} className="text-muted-foreground" />
            ) : panelType === 'diff' ? (
              <GitCompareArrows size={14} className="text-muted-foreground" />
            ) : (
              <ProcessIcon
                process={getTabProcess(tab)}
                className={cn('h-3.5 w-3.5', getTabNerdColor(tab))}
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <span className="block truncate">{getTabDisplayName(tab)}</span>
            {agentSummary && (
              <span className="block truncate text-xs text-muted-foreground/70">
                {agentSummary}
              </span>
            )}
          </div>
        </button>
      </div>
    );
  };

  const renderPaneTree = (workspaceId: string) => {
    const panes = workspaceLayouts[workspaceId] ?? [];
    if (panes.length === 0) return null;

    const isMultiPane = panes.length > 1;

    return panes.map((pane, index) => {
      const sortedTabs = [...pane.tabs].sort((a, b) => a.order - b.order);

      return (
        <div key={pane.id} className="pb-1">
          {isMultiPane && (
            <div className="flex items-center py-1.5 pl-10 pr-2">
              <span className="text-xs text-muted-foreground">
                Pane {index + 1}
              </span>
            </div>
          )}
          {sortedTabs.map((tab) => renderSurfaceItem(workspaceId, pane, tab, 'pl-10'))}
        </div>
      );
    });
  };

  type TSection =
    | { type: 'group'; group: IWorkspaceGroup; workspaces: IWorkspace[] }
    | { type: 'ungrouped'; workspaces: IWorkspace[] };

  const workspaceDepths = useMemo(() => {
    const byId = new Map(workspaces.map((ws) => [ws.id, ws]));
    return new Map(workspaces.map((ws) => {
      let depth = 0;
      let parentId = ws.parentWorkspaceId;
      const seen = new Set([ws.id]);
      while (parentId && !seen.has(parentId) && depth < 6) {
        const parent = byId.get(parentId);
        if (!parent) break;
        seen.add(parentId);
        depth++;
        parentId = parent.parentWorkspaceId;
      }
      return [ws.id, depth];
    }));
  }, [workspaces]);

  const sections = useMemo<TSection[]>(() => {
    const validGroupIds = new Set(groups.map((g) => g.id));
    const byGroup = new Map<string, IWorkspace[]>();
    const ungrouped: IWorkspace[] = [];
    for (const ws of getVisuallyOrderedWorkspaces(workspaces, groups)) {
      const gid = ws.groupId ?? null;
      if (gid && validGroupIds.has(gid)) {
        const list = byGroup.get(gid) ?? [];
        list.push(ws);
        byGroup.set(gid, list);
      } else {
        ungrouped.push(ws);
      }
    }
    const out: TSection[] = groups.map((g) => ({
      type: 'group',
      group: g,
      workspaces: byGroup.get(g.id) ?? [],
    }));
    out.push({ type: 'ungrouped', workspaces: ungrouped });
    return out;
  }, [workspaces, groups]);

  const renderWorkspaceRow = (ws: IWorkspace) => {
    if (!workspaceVisibility.visibleIds.has(ws.id)) return null;
    const isExpanded = ws.id === expandedWsId;
    const isActive = ws.id === activeWorkspaceId;
    return (
      <div key={ws.id} style={{ marginLeft: (workspaceDepths.get(ws.id) ?? 0) * 12 }}>
        <MobileWorkspaceActions workspace={ws} onCreated={(id) => {
          useWorkspaceStore.getState().switchWorkspace(id);
          setExpandedWsId(id);
        }}>
          <button
            {...dragProps({ kind: 'workspace', id: ws.id })}
            className={cn(
              'flex min-w-0 flex-1 select-none items-center gap-2 py-3 pl-4 pr-1 text-left text-sm transition-colors',
              isActive
                ? 'font-medium text-foreground'
                : 'text-foreground hover:bg-accent/50',
            )}
            onClick={() => handleToggleWorkspace(ws.id)}
          >
            {isExpanded ? (
              <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                {(workspaceDepths.get(ws.id) ?? 0) > 0 && <CornerDownRight aria-hidden="true" size={14} className="shrink-0 text-accent-color" />}
                {ws.worktree ? <GitBranch size={14} className="shrink-0 text-ui-blue" />
                  : <Folder size={14} className="shrink-0 text-muted-foreground" />}
                <span className="truncate">{ws.name}</span>
              </span>
              {ws.worktree && <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={ws.worktree.branch}>
                <span className="mr-1 rounded bg-muted px-1 text-[10px]">worktree</span>
                {ws.worktree.branch}
              </span>}
              <WorkspacePortsLabel workspaceId={ws.id} />
              {!isExpanded && (
                <WorkspaceStatusIndicator
                  workspaceId={ws.id}
                  tabs={(workspaceLayouts[ws.id] ?? []).flatMap((pane) =>
                    [...pane.tabs].sort((a, b) => a.order - b.order),
                  )}
                />
              )}
            </div>
          </button>
        </MobileWorkspaceActions>
        <div
          className="grid transition-[grid-template-rows] duration-200 ease-in-out"
          style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
        >
          <div className="overflow-hidden">{renderPaneTree(ws.id)}</div>
        </div>
      </div>
    );
  };

  const renameTargetGroup = renameGroupId
    ? groups.find((g) => g.id === renameGroupId) ?? null
    : null;

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="left" className="w-72 gap-0 p-0" showCloseButton={false}>
        <SheetHeader className="flex-row items-center border-b py-1.5 pl-1 pr-3">
          <button
            className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground focus-visible:outline-none"
            onClick={() => onOpenChange(false)}
            aria-label={t('closeMenu')}
          >
            <X size={20} />
          </button>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Tabs
            value={mobileTab}
            onValueChange={handleMobileTabChange}
            className="min-w-0 flex-1 gap-0"
          >
            <TabsList className="h-7 w-full">
              <TabsTrigger value="workspace" className="h-full flex-1 px-2.5 text-[11px] tracking-wide">
                WORKSPACE
              </TabsTrigger>
              <TabsTrigger value="sessions" className="h-full flex-1 px-2.5 text-[11px] tracking-wide">
                SESSIONS
                {sessionsBadge > 0 && (
                  <span className="ml-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded bg-[var(--ui-coral)] px-0.5 text-[9px] font-medium leading-none text-white">
                    {sessionsBadge}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </SheetHeader>

        {mobileTab === 'workspace' ? (
          <div
            className="flex-1 overflow-y-auto overscroll-contain"
            onTouchStartCapture={onTouchDragStart}
            style={{ scrollbarWidth: 'none' }}
          >
            {sections.map((section) => {
              if (section.type === 'group') {
                return (
                  <div key={`group-${section.group.id}`} className="pt-1">
                    <MobileWorkspaceGroupHeader
                      group={section.group}
                      count={section.workspaces.length}
                      onToggle={handleToggleGroup}
                      onRenameRequest={handleRenameGroupRequest}
                      onUngroup={handleUngroupGroup}
                    />
                    {!section.group.collapsed && (
                      <div className="pl-4">
                        {section.workspaces.map(renderWorkspaceRow)}
                        {section.workspaces.length === 0 && (
                          <div className="px-4 py-2 text-xs italic text-muted-foreground/50">
                            {ts('emptyGroup')}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <div key="ungrouped">{section.workspaces.map(renderWorkspaceRow)}</div>
              );
            })}
          </div>
        ) : (
          <NotificationPanel onNavigated={() => onOpenChange(false)} className="px-3 pt-3 pb-3" />
        )}

        <div className="shrink-0 border-t">
          {mobileTab === 'workspace' && (
            <div className="flex items-stretch">
              <button
                className="flex flex-1 items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
                onClick={onCreateWorkspace}
              >
                <Plus size={16} />
                Workspace
              </button>
              <button
                className="flex w-12 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent"
                onClick={handleCreateGroup}
                aria-label={ts('newGroup')}
              >
                <FolderPlus size={16} />
              </button>
            </div>
          )}
          <SidebarRateLimits />
          <div className="flex items-center gap-0.5 px-3 pt-1 pb-4">
            {sidebarItems.map((item) => {
              const isExternal = item.url.startsWith('http://') || item.url.startsWith('https://');
              const navPath = isExternal ? `/webview?url=${encodeURIComponent(item.url)}` : item.url;
              return (
                <button
                  key={item.id}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(navPath);
                  }}
                  aria-label={item.name}
                  title={item.name}
                >
                  <IconRenderer name={item.icon} className="h-[15px] w-[15px]" />
                </button>
              );
            })}
            <button
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
              onClick={() => {
                onOpenChange(false);
                onOpenSettings();
              }}
              aria-label={tc('settings')}
            >
              <Settings size={15} />
            </button>
          </div>
        </div>
      </SheetContent>

      {renameTargetGroup && (
        <RenameGroupDialog
          open={!!renameTargetGroup}
          onOpenChange={(v) => { if (!v) setRenameGroupId(null); }}
          groupId={renameTargetGroup.id}
          currentName={renameTargetGroup.name}
        />
      )}
    </Sheet>
  );
};

export default MobileNavigationSheet;
