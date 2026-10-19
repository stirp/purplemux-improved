import fs from 'fs/promises';
import path from 'path';
import { collectPanes, readLayoutFile, resolveLayoutFile, removeTabFromPane } from '@/lib/layout-store';
import { getWorkspaces, getIdleTabPolicy, saveIdleTabPolicy, retainReclaimedSession } from '@/lib/workspace-store';
import { getAllPanesInfo } from '@/lib/tmux';
import { listUserProcesses, getProcessArgv, type ISystemProcess } from '@/lib/process-utils';
import { classifyAgentArgv } from '@/lib/local-agent-session';
import { getProviderByPanelType } from '@/lib/providers';
import { getStatusManager } from '@/lib/status-manager';
import { getInputQueue } from '@/lib/input-queue-server';
import { getLastTerminalInput } from '@/lib/terminal-input-activity';
import { stopIdleAgentChain } from '@/lib/idle-agent-shutdown';
import { createLogger } from '@/lib/logger';
import type { IIdleTabCandidate, IIdleTabPreview, IIdleTabResult, TIdleTabPolicy, TIdleTabTarget } from '@/lib/idle-tab-policy';
import type { ITab } from '@/types/terminal';

const log = createLogger('idle-tabs');
const g = globalThis as unknown as {
  __ptIdleTabLock?: Promise<unknown>;
  __ptIdleTabTimer?: ReturnType<typeof setInterval>;
  __ptIdleTabTick?: boolean;
};
const serial = <T>(action: () => Promise<T>): Promise<T> => {
  const result = (g.__ptIdleTabLock ?? Promise.resolve()).then(action, action);
  g.__ptIdleTabLock = result.catch(() => {});
  return result;
};

// Only a shell / known Node launcher / native agent chain can be reclaimed.
export const idleAgentProcessChain = async (
  rootPid: number, processes: ISystemProcess[], providerId: 'claude' | 'codex',
): Promise<ISystemProcess[] | null> => {
  const chain: ISystemProcess[] = [];
  let current = processes.find((item) => item.pid === rootPid);
  let foundAgent = false;
  while (current && chain.length < 32) {
    if (chain.some((item) => item.pid === current!.pid)) return null;
    const argv = await getProcessArgv(current);
    const agent = classifyAgentArgv(argv);
    const executable = path.basename(argv[0] ?? '');
    if (agent !== providerId && (foundAgent || !/^(bash|zsh|sh|fish|dash|ksh)$/.test(executable))) return null;
    if (agent) foundAgent = true;
    chain.push(current);
    const children = processes.filter((item) => item.ppid === current!.pid);
    if (!children.length) return foundAgent ? chain : null;
    if (children.length !== 1 || (agent && !/^(node|nodejs|bun)$/.test(executable))) return null;
    current = children[0];
  }
  return null;
};

interface IReclaimableTab extends IIdleTabCandidate {
  tab: ITab;
  processes: ISystemProcess[];
}

const scan = async (target?: TIdleTabTarget): Promise<{ policy: TIdleTabPolicy; tabs: IReclaimableTab[] }> => {
  const [policy, { workspaces }, panes, processes] = await Promise.all([
    getIdleTabPolicy(), getWorkspaces({ strict: true }), getAllPanesInfo({ strict: true }), listUserProcesses(),
  ]);
  const statuses = getStatusManager().getAllForClient();
  const tabs: IReclaimableTab[] = [];
  for (const workspace of workspaces) {
    if (target && workspace.id !== target.workspaceId) continue;
    const layout = await readLayoutFile(resolveLayoutFile(workspace.id));
    if (!layout) continue;
    for (const pane of collectPanes(layout.root)) {
      if (target && pane.id !== target.paneId) continue;
      for (const tab of pane.tabs) {
        if (target && tab.id !== target.tabId) continue;
        try {
          const provider = getProviderByPanelType(tab.panelType);
          if (!provider || (provider.id !== 'claude' && provider.id !== 'codex')) continue;
          const state = statuses[tab.id];
          const sessionId = provider.readSessionId(tab);
          const jsonl = provider.readJsonlPath(tab);
          if (!state || !sessionId || !provider.isValidSessionId(sessionId) || !jsonl
            || state.agentSessionId !== sessionId || state.workspaceId !== workspace.id
            || !['idle', 'ready-for-review', 'cancelled'].includes(state.cliState)
            || state.compactingSince || state.permissionRequest || getInputQueue().hasPendingInput(tab.id)
            || provider.sessionIdFromJsonlPath(jsonl) !== sessionId) continue;
          const terminal = panes.get(tab.sessionName);
          if (!terminal?.path || [...panes.keys()].some((key) => key.startsWith(`${tab.sessionName}:`))) continue;
          const chain = await idleAgentProcessChain(terminal.pid, processes, provider.id);
          if (!chain) continue;
          const [stat, directory, runtime] = await Promise.all([
            fs.stat(jsonl), fs.stat(terminal.path), provider.readRuntimeSnapshot(jsonl, { force: true }),
          ]);
          if (!stat.isFile() || !stat.size || !directory.isDirectory() || !runtime.idle || runtime.stale || !runtime.lastEntryTs) continue;
          const lastActivityAt = Math.max(stat.mtimeMs, runtime.lastEntryTs, state.lastEvent?.at ?? 0,
            getLastTerminalInput(tab.sessionName), ...chain.map((item) => Date.parse(item.startedAt)));
          if (!Number.isFinite(lastActivityAt) || Date.now() - lastActivityAt < policy.idleMinutes * 60000) continue;
          tabs.push({ workspaceId: workspace.id, workspaceName: workspace.name, paneId: pane.id,
            tabId: tab.id, tabName: tab.name, providerId: provider.id, sessionId,
            cwd: terminal.path, lastActivityAt, tab, processes: chain });
        } catch (error) {
          log.debug({ tabId: tab.id, error: String(error) }, 'Skipping uncertain idle tab');
        }
      }
    }
  }
  return { policy, tabs };
};

export const previewIdleTabs = (): Promise<IIdleTabPreview> => serial(async () => {
  const { policy, tabs } = await scan();
  return { policy, candidates: tabs.map(({ tab: _tab, processes: _processes, ...candidate }) => candidate) };
});

export const updateIdleTabPolicy = (policy: TIdleTabPolicy) => serial(() => saveIdleTabPolicy(policy));

const samePolicy = (a: TIdleTabPolicy, b: TIdleTabPolicy) => a.enabled === b.enabled && a.idleMinutes === b.idleMinutes;
const findTarget = (tabs: IReclaimableTab[], target: TIdleTabTarget) => tabs.find((item) =>
  item.tabId === target.tabId && item.workspaceId === target.workspaceId && item.paneId === target.paneId
  && item.sessionId === target.sessionId && item.lastActivityAt === target.lastActivityAt);

const reclaim = async (targets: TIdleTabTarget[], policy: TIdleTabPolicy): Promise<IIdleTabResult> => {
  const result: IIdleTabResult = { reclaimed: [], skipped: [] };
  for (const target of targets) {
    try {
      const current = await scan(target);
      const candidate = findTarget(current.tabs, target);
      if (!samePolicy(current.policy, policy) || !candidate) throw new Error('Tab activity, identity or policy changed; refresh the list');
      await retainReclaimedSession(target.tabId, {
        workspaceId: target.workspaceId, workspaceDir: candidate.cwd, tabName: candidate.tabName,
        panelType: candidate.tab.panelType, agentProviderId: candidate.providerId, agentSessionId: candidate.sessionId,
        cliState: getStatusManager().getAllForClient()[target.tabId]?.cliState,
      });
      const removed = await removeTabFromPane(target.workspaceId, target.paneId, target.tabId, {
        beforeClose: async (tab) => {
          const latest = await scan(target);
          const match = findTarget(latest.tabs, target);
          const status = getStatusManager().getAllForClient()[target.tabId];
          if (!samePolicy(latest.policy, policy) || !match || match.cwd !== candidate.cwd
            || !status || !['idle', 'ready-for-review', 'cancelled'].includes(status.cliState)
            || status.agentSessionId !== target.sessionId || status.compactingSince || status.permissionRequest
            || (status.lastEvent?.at ?? 0) > target.lastActivityAt
            || JSON.stringify(tab) !== JSON.stringify(candidate.tab)
            || JSON.stringify(match.processes) !== JSON.stringify(candidate.processes)
            || getLastTerminalInput(tab.sessionName) > target.lastActivityAt
            || getInputQueue().hasPendingInput(tab.id)) throw new Error('Tab changed before close');
          await stopIdleAgentChain(candidate.processes, candidate.providerId);
          if (getLastTerminalInput(tab.sessionName) > target.lastActivityAt || getInputQueue().hasPendingInput(tab.id)) {
            throw new Error('New input during shutdown; terminal retained');
          }
        },
        afterClose: async () => {
          const [remainingPanes, remainingProcesses] = await Promise.all([getAllPanesInfo({ strict: true }), listUserProcesses()]);
          if ([...remainingPanes.keys()].some((key) => key === candidate.tab.sessionName || key.startsWith(`${candidate.tab.sessionName}:`))
            || candidate.processes.some((old) => remainingProcesses.some((live) => live.pid === old.pid && live.startedAt === old.startedAt))) {
            throw new Error('Terminal processes have not stopped; tab retained');
          }
        },
      });
      if (!removed) throw new Error('Tab could not be removed');
      getStatusManager().removeTab(target.tabId);
      result.reclaimed.push(target);
    } catch (error) {
      result.skipped.push({ target, reason: error instanceof Error ? error.message : 'Reclamation failed' });
    }
  }
  return result;
};

export const reclaimIdleTabs = (targets: TIdleTabTarget[], policy: TIdleTabPolicy) => serial(() => reclaim(targets, policy));

export const runIdleTabReclamation = () => serial(async (): Promise<void> => {
  if (!(await getIdleTabPolicy()).enabled) return;
  const { policy, tabs } = await scan();
  const targets = tabs.map(({ workspaceId, paneId, tabId, sessionId, lastActivityAt }) =>
    ({ workspaceId, paneId, tabId, sessionId, lastActivityAt }));
  const result = await reclaim(targets, policy);
  if (result.reclaimed.length || result.skipped.length) log.info({ reclaimed: result.reclaimed.length, skipped: result.skipped }, 'Idle tab reclamation');
});

export const startIdleTabReclamation = (): void => {
  if (g.__ptIdleTabTimer) return;
  g.__ptIdleTabTimer = setInterval(() => {
    if (g.__ptIdleTabTick) return;
    g.__ptIdleTabTick = true;
    void runIdleTabReclamation().catch((error) => log.warn({ error: String(error) }, 'Idle tab scan failed'))
      .finally(() => { g.__ptIdleTabTick = false; });
  }, 60000);
  g.__ptIdleTabTimer.unref();
};

export const stopIdleTabReclamation = (): void => {
  if (g.__ptIdleTabTimer) clearInterval(g.__ptIdleTabTimer);
  g.__ptIdleTabTimer = undefined;
};
