import { useMemo } from 'react';
import useSWR from 'swr';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import useTabStore from '@/hooks/use-tab-store';
import { useLayoutStore } from '@/hooks/use-layout';
import { collectAllTabs } from '@/lib/layout-tree';
import { loadNewTabSessions, mergeNewTabSessions } from '@/lib/new-tab-sessions';
import type { IWorkflowTab } from '@/lib/session-workflow';

const useNewTabSessions = () => {
  const workspaceId = useLayoutStore((state) => state.workspaceId);
  const layout = useLayoutStore((state) => state.layout);
  const workspace = useWorkspaceStore((state) => state.workspaces.find((item) => item.id === workspaceId));
  const workflow = useWorkspaceStore((state) => state.sessionWorkflow);
  const entries = useSessionHistoryStore((state) => state.entries);
  const liveTabs = useTabStore((state) => state.tabs);
  const tabs = useMemo(() => {
    const result: Record<string, IWorkflowTab> = { ...liveTabs };
    if (workspace && layout) {
      for (const tab of collectAllTabs(layout.root)) {
        result[tab.id] = {
          workspaceName: workspace.name, workspaceDir: tab.cwd,
          panelType: tab.panelType, agentProviderId: tab.agentState?.providerId,
          agentSessionId: tab.agentState?.sessionId ?? tab.claudeSessionId,
          lastUserMessage: tab.lastUserMessage, ...liveTabs[tab.id], workspaceId: workspace.id,
        };
      }
    }
    return result;
  }, [layout, liveTabs, workspace]);
  const retained = useMemo(() => workspace
    ? mergeNewTabSessions(workspace, [], entries, tabs, workflow) : [], [workspace, entries, tabs, workflow]);
  const directories = [...new Set([
    ...(workspace?.directories ?? []),
    ...retained.map((session) => session.target.workspaceDir).filter((dir): dir is string => !!dir),
    ...Object.values(tabs).filter((tab) => tab.workspaceId === workspaceId)
      .map((tab) => tab.workspaceDir).filter((dir): dir is string => !!dir),
  ])].sort();
  const { data, isLoading, isValidating, error, mutate } = useSWR(
    workspace ? ['new-tab-sessions', workspace.id, directories] : null,
    () => loadNewTabSessions(workspace!, directories),
    { revalidateOnFocus: false, dedupingInterval: 0 },
  );
  const sessions = useMemo(() => workspace
    ? mergeNewTabSessions(workspace, data?.sessions ?? [], entries, tabs, workflow) : [],
  [workspace, data, entries, tabs, workflow]);
  return { sessions, isLoading, isValidating, hasError: !!error || !!data?.hasError, refresh: mutate };
};

export default useNewTabSessions;
