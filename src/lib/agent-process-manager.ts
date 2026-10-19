import fs from 'fs/promises';
import path from 'path';
import { setTimeout as delay } from 'timers/promises';
import { ancestorPids, scanLocalAgentProcesses } from '@/lib/local-agent-processes';
import { getProcessArgv, getProcessCwd, listUserProcesses } from '@/lib/process-utils';
import { classifyAgentArgv, resolveLocalAgentSession } from '@/lib/local-agent-session';
import { createWorkspace, getWorkspaces, saveAgentProcessTransfer } from '@/lib/workspace-store';
import { addTabToPane, collectPanes, readLayoutFile, resolveLayoutFile, patchTab, updateTabAgentState } from '@/lib/layout-store';
import { checkTerminalProcess, getSessionCwd, getSessionPanePid, hasSession, sendKeys } from '@/lib/tmux';
import { getProvider } from '@/lib/providers';
import { getStatusManager } from '@/lib/status-manager';
import { getLastTerminalInput } from '@/lib/terminal-input-activity';
import type { IAgentProcessIdentity, IAgentProcessTransfer, TLocalAgent } from '@/types/agent-process';

const g = globalThis as unknown as { __ptAgentProcessLock?: Promise<unknown> };
const fail = (message: string) => Object.assign(new Error(message), { status: 409 });

const currentProcess = async (identity: IAgentProcessIdentity, providerId: TLocalAgent) => {
  const processes = await listUserProcesses();
  if (ancestorPids(process.pid, processes).includes(identity.pid)) throw fail('Cannot stop the server or its ancestors');
  const item = processes.find((item) => item.pid === identity.pid);
  if (!item) return null;
  if (item.startedAt !== identity.startedAt || classifyAgentArgv(await getProcessArgv(item)) !== providerId) {
    throw fail('Process identity changed; refresh the list');
  }
  return item;
};

const stopAndWait = async (identity: IAgentProcessIdentity, providerId: TLocalAgent, transfer?: IAgentProcessTransfer) => {
  const item = await currentProcess(identity, providerId);
  if (!item) return;
  if (transfer) {
    const cwd = await getProcessCwd(item.pid);
    const session = cwd && await resolveLocalAgentSession(item.pid, providerId, cwd, await getProcessArgv(item), item.startedAt);
    if (cwd !== transfer.cwd || !session || session.sessionId !== transfer.sessionId) {
      throw fail('Source session changed; the original process was not stopped');
    }
    if (!(await currentProcess(identity, providerId))) return;
  }
  try { process.kill(identity.pid, 'SIGTERM'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  const deadline = Date.now() + 10000;
  for (let i = 0; i < 40 && Date.now() < deadline; i++) {
    await delay(250);
    if (!(await currentProcess(identity, providerId))) return;
  }
  throw fail('Process did not exit; no resume command was sent');
};

const runAction = async (action: 'stop' | 'adopt', identity: IAgentProcessIdentity) => {
  const { workspaces } = await getWorkspaces({ strict: true });
  let workspace = workspaces.find((item) => item.agentProcessTransfers?.some((entry) =>
    entry.pid === identity.pid && entry.startedAt === identity.startedAt));
  let transfer = workspace?.agentProcessTransfers?.find((entry) =>
    entry.pid === identity.pid && entry.startedAt === identity.startedAt);
  if (action === 'adopt' && transfer?.phase === 'started') {
    return { workspaceId: workspace!.id, tabId: transfer.tabId };
  }
  const snapshot = await scanLocalAgentProcesses();
  const source = snapshot.processes.find((item) => item.pid === identity.pid && item.startedAt === identity.startedAt);
  if (action === 'stop') {
    if (!source) throw fail('Process no longer exists; refresh the list');
    await stopAndWait(identity, source.providerId);
    return { stopped: true };
  }
  if (source?.managed) return { workspaceId: source.workspaceId };
  if (!transfer && (!source?.cwd || !source.session)) throw fail('Cannot reliably identify a resumable session for this process');
  const providerId = transfer?.providerId ?? source!.providerId;
  const cwd = transfer?.cwd ?? source!.cwd!;
  const session = transfer ?? source!.session!;
  const provider = getProvider(providerId);
  if (!provider || !(await provider.preflight()).installed) throw fail('Agent is not available in the server environment');
  if (!(await fs.stat(cwd)).isDirectory()) throw fail('Working directory is unavailable');
  await fs.access(session.jsonlPath, fs.constants.R_OK);
  if (!transfer) {
    workspace = workspaces.find((item) => item.directories.includes(cwd))
      ?? await createWorkspace(cwd, path.basename(cwd));
    const layout = await readLayoutFile(resolveLayoutFile(workspace.id));
    const pane = layout && collectPanes(layout.root)[0];
    if (!pane) throw fail('Workspace layout is unavailable');
    const tab = await addTabToPane(workspace.id, pane.id, `${provider.displayName} · ${identity.pid}`, cwd, 'terminal');
    if (!tab || tab.cwd !== cwd) throw fail('Could not prepare a terminal in the original directory');
    transfer = { ...identity, providerId, cwd, sessionId: session.sessionId, jsonlPath: session.jsonlPath,
      tabId: tab.id, tmuxSession: tab.sessionName, phase: 'prepared' };
    await saveAgentProcessTransfer(workspace.id, transfer);
  }
  const targetWorkspace = workspace!;
  const target = transfer as IAgentProcessTransfer;
  const layout = await readLayoutFile(resolveLayoutFile(targetWorkspace.id));
  const pane = layout && collectPanes(layout.root).find((item) => item.tabs.some((tab) => tab.id === target.tabId));
  if (!pane || !(await hasSession(target.tmuxSession))) throw fail('Prepared terminal was removed; open the workspace to recover the session');
  const command = await provider.buildResumeCommand(target.sessionId, { workspaceId: targetWorkspace.id });
  const panePid = await getSessionPanePid(target.tmuxSession);
  if (!panePid) throw fail('Prepared terminal is unavailable');
  const lastInput = getLastTerminalInput(target.tmuxSession);
  const validateTarget = async () => {
    const latest = await readLayoutFile(resolveLayoutFile(targetWorkspace.id));
    const tab = latest && collectPanes(latest.root).find((item) => item.id === pane.id)?.tabs.find((item) => item.id === target.tabId);
    if (!tab || tab.sessionName !== target.tmuxSession || (tab.panelType && tab.panelType !== 'terminal')
      || !(await hasSession(target.tmuxSession)) || await getSessionPanePid(target.tmuxSession) !== panePid
      || !(await checkTerminalProcess(target.tmuxSession)).isSafe
      || await getSessionCwd(target.tmuxSession) !== cwd
      || getLastTerminalInput(target.tmuxSession) !== lastInput) {
      throw fail('Prepared terminal changed or is busy; no resume command was sent');
    }
  };
  const alreadyRunning = await provider.isAgentRunning(panePid);
  if (!alreadyRunning) {
    if (target.phase === 'dispatching') {
      throw fail('Resume delivery is uncertain; open the prepared terminal to check startup before retrying');
    }
    await validateTarget();
    // A previously prepared transfer may have changed sessions before retrying.
    if (source && (source.session?.sessionId !== target.sessionId || source.cwd !== cwd)) {
      throw fail('Source session changed; the original process was not stopped');
    }
    await stopAndWait(identity, providerId, target);
    target.phase = 'stopped';
    await saveAgentProcessTransfer(targetWorkspace.id, target);
    await validateTarget();
    target.phase = 'dispatching';
    await saveAgentProcessTransfer(targetWorkspace.id, target);
    try {
      await validateTarget();
    } catch (error) {
      target.phase = 'stopped';
      await saveAgentProcessTransfer(targetWorkspace.id, target);
      throw error;
    }
    // A lost tmux response must not cause a second resume command on retry.
    await sendKeys(target.tmuxSession, command);
    await delay(500);
  } else {
    const detected = await provider.detectActiveSession(panePid);
    if (target.phase === 'prepared' || detected.sessionId !== target.sessionId) {
      throw fail('Target terminal is running a different or unidentified session');
    }
    if (await currentProcess(identity, providerId)) {
      throw fail('Both terminals have a running agent; resolve this conflict before retrying');
    }
  }
  await updateTabAgentState(target.tmuxSession, provider, { sessionId: target.sessionId, jsonlPath: target.jsonlPath });
  if (!(await patchTab(targetWorkspace.id, pane.id, target.tabId, { panelType: provider.panelType }))) {
    throw fail('Target tab disappeared after resume');
  }
  getStatusManager().registerTab(target.tabId, {
    cliState: 'inactive', workspaceId: targetWorkspace.id, tabName: provider.displayName,
    tmuxSession: target.tmuxSession, panelType: provider.panelType, agentProviderId: providerId,
    agentSessionId: target.sessionId, lastEvent: null, eventSeq: 0,
  });
  getStatusManager().markAgentLaunch(target.tabId);
  target.phase = 'started';
  await saveAgentProcessTransfer(targetWorkspace.id, target);
  return { workspaceId: targetWorkspace.id, tabId: target.tabId };
};

export const manageAgentProcess = (action: 'stop' | 'adopt', identity: IAgentProcessIdentity) => {
  const result = (g.__ptAgentProcessLock ?? Promise.resolve()).catch(() => {}).then(() => runAction(action, identity));
  g.__ptAgentProcessLock = result.catch(() => {});
  return result;
};
