import { getTabAgentProviderId } from '@/lib/tab-agent-identity';
import { useMemo, useState, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  GitBranch,
  FolderPlus,
  GitCompareArrows,
  Globe,
  Plus,
  Settings,
  Search,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import ClaudeCodeIcon from '@/components/icons/claude-code-icon';
import OpenAIIcon from '@/components/icons/openai-icon';
import { useRouter } from 'next/router';
import useSidebarItems from '@/hooks/use-sidebar-items';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useSelectWorkspace } from '@/hooks/use-sidebar-actions';
import IconRenderer from '@/components/features/settings/icon-renderer';
import { cn } from '@/lib/utils';
import useVisualViewport from '@/hooks/use-visual-viewport';
import AppLogo from '@/components/layout/app-logo';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { searchWorkspaces } from '@/lib/workspace-search';
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
import useTabStore from '@/hooks/use-tab-store';
import { formatTabTitle } from '@/lib/tab-title';
import ProcessIcon from '@/components/icons/process-icon';
import TabStatusIndicator from '@/components/features/workspace/tab-status-indicator';
import WorkspaceStatusIndicator from '@/components/features/workspace/workspace-status-indicator';
import SidebarRateLimits from '@/components/layout/sidebar-rate-limits';
import MobileWorkspaceGroupHeader from '@/components/features/mobile/mobile-workspace-group-header';
import RenameGroupDialog from '@/components/features/workspace/rename-group-dialog';
import MobileWorkspaceActions from '@/components/features/mobile/mobile-workspace-actions';
import WorkspaceTreeGuides, { WORKSPACE_TREE_INDENT } from '@/components/features/workspace/workspace-tree-guides';
import { getVisuallyOrderedWorkspaces, getWorkspaceTreePosition } from '@/lib/workspace-order';
import useWorkspaceExpansion from '@/hooks/use-workspace-expansion';
import useTouchDrag from '@/hooks/use-touch-drag';
import useNavigationDrag, { reorderNavigationIds } from '@/hooks/use-navigation-drag';

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
  const viewport = useVisualViewport(open);
  const t = useTranslations('mobile');
  const tt = useTranslations('terminal');
  const tc = useTranslations('common');
  const ts = useTranslations('sidebar');
  const router = useRouter();
  const selectWorkspace = useSelectWorkspace();
  const mobileTab = useWorkspaceStore((s) => s.sidebarTab);
  const groups = useWorkspaceStore((s) => s.groups);

  const handleMobileTabChange = useCallback((v: string) => {
    useWorkspaceStore.getState().setSidebarTab(v as 'workspace' | 'sessions');
  }, []);
  const { attentionCount, busyCount } = useNotificationCount();
  const sessionsBadge = attentionCount + busyCount;
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const searchResult = useMemo(() => searchWorkspaces(workspaces, workspaceQuery), [workspaces, workspaceQuery]);
  const { visibility: workspaceVisibility, toggleWorkspace, revealWorkspace } = useWorkspaceExpansion(workspaces, activeWorkspaceId, !!searchResult);
  const [renameGroupId, setRenameGroupId] = useState<string | null>(null);
  const onTouchDragStart = useTouchDrag();
  const dragProps = useNavigationDrag((source, target, after) => {
    if (searchResult) return;
    if (source.kind === 'group' && target.kind === 'group') {
      const store = useWorkspaceStore.getState();
      const ids = store.groups.map((group) => group.id);
      const ordered = reorderNavigationIds(ids, source.id, target.id, after);
      store.reorderGroups(ids.indexOf(source.id), ordered.indexOf(source.id));
    } else if (source.kind === 'workspace' && target.kind === 'workspace') {
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
      selectWorkspace(workspaceId, { reveal: false });
      toggleWorkspace(workspaceId, true);
    },
    [selectWorkspace, toggleWorkspace],
  );

  const getTabDisplayName = (tab: ITab) => {
    if (tab.name) return tab.name;
    if (tab.panelType === 'agent-sessions') return tt('sessionList');
    const meta = metadata[tab.id];
    const rawTitle = meta?.title || tab.title;
    const formatted = rawTitle ? formatTabTitle(rawTitle, tab.panelType, getTabAgentProviderId(tab)) : '';
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
            'flex min-h-12 w-full select-none items-center gap-2 rounded-md border border-transparent py-2 pr-3 text-left text-sm transition-colors',
            indent,
            isTabActive
              ? 'border-sidebar-border/60 bg-sidebar-accent font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent/50',
          )}
          onClick={() => {
            onSelectSurface(workspaceId, pane.id, tab.id);
          }}
          {...(!searchResult ? dragProps({ kind: 'tab', id: tab.id, workspaceId, paneId: pane.id }) : { draggable: false })}
          aria-current={isTabActive ? 'true' : undefined}
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
            {isTabActive && agentSummary && (
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

  const treePositions = useMemo(() => new Map(workspaces.map((ws) =>
    [ws.id, getWorkspaceTreePosition(workspaces, ws.id)],
  )), [workspaces]);

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
    if (!(searchResult ?? workspaceVisibility).visibleIds.has(ws.id)) return null;
    const isExpanded = (searchResult ?? workspaceVisibility).expandedIds.has(ws.id);
    const isActive = ws.id === activeWorkspaceId;
    const position = treePositions.get(ws.id)!;
    const depth = position.rails.length;
    const workspaceDragProps = searchResult ? { draggable: false, style: {} } : dragProps({ kind: 'workspace', id: ws.id });
    const layoutTabs = (workspaceLayouts[ws.id] ?? []).flatMap((pane) => [...pane.tabs].sort((a, b) => a.order - b.order));
    const canExpand = position.childCount > 0 || layoutTabs.length > 0;
    const statusId = `mobile-workspace-status-${ws.id}`;
    return (
      <div key={ws.id} className="relative">
        <div className="pointer-events-none absolute inset-0 -translate-x-2"><WorkspaceTreeGuides position={position} expanded={isExpanded} mobile /></div>
        <MobileWorkspaceActions workspace={ws} tabs={layoutTabs} isActive={isActive} onCreated={(id) => {
          useWorkspaceStore.getState().switchWorkspace(id);
          revealWorkspace(id);
        }}>
          <button
            {...workspaceDragProps}
            data-touch-context-menu
            style={{ ...workspaceDragProps.style, paddingLeft: 8 + depth * WORKSPACE_TREE_INDENT }}
            className={cn(
              'flex min-h-12 min-w-0 flex-1 select-none items-center gap-2 py-2 pr-1 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-purple',
              isActive
                ? 'font-medium text-sidebar-foreground'
                : 'text-foreground hover:bg-accent/50',
            )}
            onClick={() => handleToggleWorkspace(ws.id)}
            aria-expanded={canExpand ? isExpanded : undefined}
            aria-current={isActive ? 'true' : undefined}
            aria-describedby={statusId}
          >
            {!canExpand ? <span className="w-3.5 shrink-0" aria-hidden="true" /> : isExpanded ? (
              <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
            )}
            {ws.worktree || depth > 0 ? <GitBranch size={16} className="shrink-0 text-ui-blue" />
              : <Folder size={16} className="shrink-0 text-muted-foreground" />}
            <span className="min-w-0 flex-1 truncate" title={ws.name}>{ws.name}</span>
            {position.childCount > 0 && <span className="shrink-0 text-xs text-muted-foreground">{position.childCount}</span>}
            <WorkspaceStatusIndicator id={statusId} workspaceId={ws.id} tabs={layoutTabs} compact />
          </button>
        </MobileWorkspaceActions>
        {/* Keep navigation independent of grid-track animation support on iOS 15. */}
        {isExpanded && !searchResult && <div style={{ paddingLeft: depth * WORKSPACE_TREE_INDENT }}>{renderPaneTree(ws.id)}</div>}
      </div>
    );
  };

  const renameTargetGroup = renameGroupId
    ? groups.find((g) => g.id === renameGroupId) ?? null
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" style={viewport ? { ...viewport, right: undefined } : undefined} data-short-viewport={typeof viewport?.height === 'number' && viewport.height < 500 || undefined} className="mobile-navigation-sheet font-sans gap-0 bg-sidebar p-0 text-sidebar-foreground shadow-none" showCloseButton={false}>
        <SheetHeader className="shrink-0 flex-row items-center gap-2 px-3 py-1">
          <AppLogo className="min-w-0 flex-1 [&>span]:truncate" />
          <SheetTitle className="sr-only">{ts('workspaceList')}</SheetTitle>
          <Button variant="ghost" size="icon" className="size-11 shrink-0" onClick={() => onOpenChange(false)} aria-label={t('closeMenu')}>
            <X size={20} />
          </Button>
        </SheetHeader>
        <Tabs
          value={mobileTab}
          onValueChange={handleMobileTabChange}
          className="shrink-0 gap-0 px-3"
        >
          <TabsList className="h-auto min-h-12 w-full border border-sidebar-border/50">
            <TabsTrigger value="workspace" className="min-h-11 flex-1 px-2.5 text-sm">
              {ts('workspaceTab')}
            </TabsTrigger>
            <TabsTrigger value="sessions" className="min-h-11 flex-1 px-2.5 text-sm">
              {ts('sessionsTab')}
              {sessionsBadge > 0 && (
                <span className="ml-1 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded bg-[var(--ui-coral)] px-0.5 text-[9px] font-medium leading-none text-white">
                  {sessionsBadge}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {mobileTab === 'workspace' && <div className="relative mx-3 my-3 shrink-0">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={workspaceQuery} onChange={(event) => setWorkspaceQuery(event.target.value)}
            placeholder={ts('searchWorkspaces')} aria-label={ts('searchWorkspaces')}
            className="min-h-11 pl-9 pr-11 text-base shadow-none"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                if (!event.nativeEvent.isComposing) setWorkspaceQuery('');
              }
            }} />
          {workspaceQuery && <Button variant="ghost" size="icon" className="absolute right-0 top-0 size-11" aria-label={ts('clearSearch')} onClick={() => setWorkspaceQuery('')}><X size={16} /></Button>}
        </div>}

        {mobileTab === 'workspace' ? (
          <div
            className="mobile-navigation-list min-h-0 flex-1 overflow-y-auto overscroll-contain px-2"
            onTouchStartCapture={onTouchDragStart}
            style={{ scrollbarWidth: 'none' }}
          >
            {workspaces.length === 0 && <p className="px-3 py-6 text-sm text-muted-foreground">{ts('noWorkspaces')}</p>}
            {searchResult?.visibleIds.size === 0 && workspaces.length > 0 && <p className="px-3 py-6 text-sm text-muted-foreground">{ts('noMatchingWorkspaces')}</p>}
            {sections.map((section) => {
              if (section.type === 'group') {
                if (searchResult && !section.workspaces.some((ws) => searchResult.visibleIds.has(ws.id))) return null;
                const group = searchResult ? { ...section.group, collapsed: false } : section.group;
                return (
                  <div key={`group-${section.group.id}`} className="pt-1">
                    <MobileWorkspaceGroupHeader
                      group={group}
                      dragProps={searchResult ? { draggable: false } : dragProps({ kind: 'group', id: group.id })}
                      count={searchResult ? section.workspaces.filter((ws) => searchResult.visibleIds.has(ws.id)).length : section.workspaces.length}
                      onToggle={searchResult ? () => {} : handleToggleGroup}
                      onRenameRequest={handleRenameGroupRequest}
                      onUngroup={handleUngroupGroup}
                    />
                    {!group.collapsed && (
                      <div>
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
          <NotificationPanel workspaceLayouts={workspaceLayouts} onNavigated={() => onOpenChange(false)} className="px-3 pt-3 pb-3" />
        )}

        <div className="shrink-0 border-t">
          {mobileTab === 'workspace' && (
            <div className="flex items-stretch gap-1 px-3 pt-2">
              <button
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-md border border-sidebar-border px-2 py-2 text-sm transition-colors hover:bg-accent"
                onClick={onCreateWorkspace}
              >
                <Plus size={16} />
                {ts('newWorkspace')}
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
          <div className="flex flex-wrap items-center gap-1 px-3 py-1">
            {sidebarItems.map((item) => {
              const isExternal = item.url.startsWith('http://') || item.url.startsWith('https://');
              const navPath = isExternal ? `/webview?url=${encodeURIComponent(item.url)}` : item.url;
              return (
                <button
                  key={item.id}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
                  onClick={() => {
                    onOpenChange(false);
                    router.push(navPath);
                  }}
                  aria-label={item.name}
                  title={item.name}
                >
                  <IconRenderer name={item.icon} className="size-4" />
                </button>
              );
            })}
            <button
              className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
              onClick={() => {
                onOpenChange(false);
                onOpenSettings();
              }}
              aria-label={tc('settings')}
            >
              <Settings size={16} />
              <span className="ml-2 text-xs">{tc('settings')}</span>
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
