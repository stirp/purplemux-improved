import path from 'path';
import { getProcessArgv, getProcessCwd, listUserProcesses, type ISystemProcess } from '@/lib/process-utils';
import { getAllPanesInfo } from '@/lib/tmux';
import { collectAllTabs, readLayoutFile, resolveLayoutFile } from '@/lib/layout-store';
import { getWorkspaces } from '@/lib/workspace-store';
import { classifyAgentArgv, resolveLocalAgentSession } from '@/lib/local-agent-session';
import type { IAgentProcessList, ILocalAgentProcess } from '@/types/agent-process';

export const ancestorPids = (pid: number, processes: ISystemProcess[]): number[] => {
  const byPid = new Map(processes.map((item) => [item.pid, item.ppid]));
  const result = new Set<number>();
  while (pid > 0 && !result.has(pid)) {
    result.add(pid);
    pid = byPid.get(pid) ?? 0;
  }
  return [...result];
};

export const scanLocalAgentProcesses = async (): Promise<IAgentProcessList> => {
  const [processes, panes, { workspaces }] = await Promise.all([
    listUserProcesses(), getAllPanesInfo({ strict: true }), getWorkspaces({ strict: true }),
  ]);
  const managed = new Map<number, { workspaceId: string; workspaceName: string }>();
  await Promise.all(workspaces.map(async (workspace) => {
    const layout = await readLayoutFile(resolveLayoutFile(workspace.id));
    if (!layout) return;
    for (const tab of collectAllTabs(layout.root)) {
      const pane = panes.get(tab.sessionName);
      if (pane) managed.set(pane.pid, { workspaceId: workspace.id, workspaceName: workspace.name });
    }
  }));
  const candidates = [];
  // Bound per-process filesystem/lsof work; the process table is loaded only once.
  for (const item of processes.filter((item) => /codex|claude/.test(item.args))) {
    const argv = await getProcessArgv(item);
    const providerId = classifyAgentArgv(argv);
    if (providerId) candidates.push({ ...item, argv, providerId });
  }
  const result: ILocalAgentProcess[] = [];
  for (const item of candidates) {
    const isWrapper = /^(node|nodejs|bun)$/.test(path.basename(item.argv[0]));
    if (isWrapper && candidates.some((child) => child.ppid === item.pid && child.providerId === item.providerId)) continue;
    const owner = ancestorPids(item.pid, processes).map((pid) => managed.get(pid)).find(Boolean);
    const cwd = await getProcessCwd(item.pid);
    const session = !owner && cwd
      ? await resolveLocalAgentSession(item.pid, item.providerId, cwd, item.argv, item.startedAt) : null;
    result.push({ pid: item.pid, startedAt: item.startedAt, providerId: item.providerId, cwd,
      workspaceId: owner?.workspaceId ?? null, workspaceName: owner?.workspaceName ?? null,
      managed: Boolean(owner), session });
  }
  return { processes: result, transfers: workspaces.flatMap((workspace) =>
    (workspace.agentProcessTransfers ?? []).filter((item) => item.phase !== 'started')
      .map((item) => ({ ...item, workspaceId: workspace.id, workspaceName: workspace.name }))) };
};
