import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { IWorkspace } from '@/types/terminal';

const mocks = vi.hoisted(() => ({
  scan: vi.fn(), processes: vi.fn(), argv: vi.fn(), cwd: vi.fn(), resolve: vi.fn(), workspaces: [] as IWorkspace[],
  create: vi.fn(), save: vi.fn(), add: vi.fn(), layout: vi.fn(), patch: vi.fn(), bind: vi.fn(),
  safe: vi.fn(), targetCwd: vi.fn(), panePid: vi.fn(), exists: vi.fn(), send: vi.fn(),
  preflight: vi.fn(), build: vi.fn(), running: vi.fn(), detect: vi.fn(), stat: vi.fn(), access: vi.fn(),
  register: vi.fn(), mark: vi.fn(), activity: vi.fn(), events: [] as string[], alive: true,
}));
vi.mock('timers/promises', () => ({ setTimeout: async () => {} }));
vi.mock('@/lib/terminal-input-activity', () => ({ getLastTerminalInput: mocks.activity }));
vi.mock('fs/promises', () => ({ default: { stat: mocks.stat, access: mocks.access, constants: { R_OK: 4 } } }));
vi.mock('@/lib/local-agent-processes', () => ({ scanLocalAgentProcesses: mocks.scan, ancestorPids: () => [] }));
vi.mock('@/lib/process-utils', () => ({ listUserProcesses: mocks.processes, getProcessArgv: mocks.argv, getProcessCwd: mocks.cwd }));
vi.mock('@/lib/local-agent-session', () => ({ classifyAgentArgv: (argv: string[]) => argv[0] === 'codex' ? 'codex' : null, resolveLocalAgentSession: mocks.resolve }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaces: async () => ({ workspaces: mocks.workspaces }), createWorkspace: mocks.create, saveAgentProcessTransfer: mocks.save }));
vi.mock('@/lib/layout-store', () => ({ addTabToPane: mocks.add, collectPanes: (root: unknown) => root, readLayoutFile: mocks.layout, resolveLayoutFile: (id: string) => id, patchTab: mocks.patch, updateTabAgentState: mocks.bind }));
vi.mock('@/lib/tmux', () => ({ checkTerminalProcess: mocks.safe, getSessionCwd: mocks.targetCwd, getSessionPanePid: mocks.panePid, hasSession: mocks.exists, sendKeys: mocks.send }));
vi.mock('@/lib/providers', () => ({ getProvider: () => ({ id: 'codex', displayName: 'Codex', panelType: 'codex-cli', preflight: mocks.preflight, buildResumeCommand: mocks.build, isAgentRunning: mocks.running, detectActiveSession: mocks.detect }) }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ registerTab: mocks.register, markAgentLaunch: mocks.mark }) }));
import { manageAgentProcess } from '@/lib/agent-process-manager';

const identity = { pid: 987654, startedAt: '2026-10-19T10:00:00.000Z' };
const session = { sessionId: '11111111-1111-4111-8111-111111111111', jsonlPath: '/transcript' };
const source = { ...identity, providerId: 'codex', cwd: '/repo', session, managed: false, workspaceId: null };
const row = { ...identity, ppid: 1, uid: 1000, args: 'codex' };
let kill: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.events = []; mocks.alive = true;
  mocks.activity.mockReturnValue(0);
  mocks.workspaces = [{ id: 'ws', name: 'Repo', directories: ['/repo'] }];
  mocks.scan.mockImplementation(async () => ({ processes: mocks.alive ? [source] : [], transfers: [] }));
  mocks.processes.mockImplementation(async () => mocks.alive ? [row] : []);
  mocks.argv.mockResolvedValue(['codex']); mocks.cwd.mockResolvedValue('/repo'); mocks.resolve.mockResolvedValue(session);
  mocks.preflight.mockResolvedValue({ installed: true }); mocks.stat.mockResolvedValue({ isDirectory: () => true });
  mocks.access.mockResolvedValue(undefined);
  mocks.layout.mockResolvedValue({ root: [{ id: 'pane', tabs: [{ id: 'tab', sessionName: 'target' }] }] });
  mocks.add.mockResolvedValue({ id: 'tab', cwd: '/repo', sessionName: 'target' });
  mocks.save.mockImplementation(async (_id, transfer) => {
    mocks.events.push(`save:${transfer.phase}`);
    mocks.workspaces[0].agentProcessTransfers = [structuredClone(transfer)];
  });
  mocks.exists.mockResolvedValue(true); mocks.panePid.mockResolvedValue(8);
  mocks.build.mockResolvedValue('codex resume exact-session'); mocks.running.mockResolvedValue(false);
  mocks.safe.mockResolvedValue({ isSafe: true }); mocks.targetCwd.mockResolvedValue('/repo');
  mocks.send.mockImplementation(async () => { mocks.events.push('send'); }); mocks.patch.mockResolvedValue({});
  kill = vi.spyOn(process, 'kill').mockImplementation(() => { mocks.events.push('kill'); mocks.alive = false; return true; });
});
afterEach(() => { kill.mockRestore(); });

describe('stop and resume external agents', () => {
  it.each(['busy', 'cwd', 'pane', 'removed', 'input'])('rechecks target %s after source shutdown and leaves a retryable stopped transfer', async (change) => {
    kill.mockImplementation(() => {
      mocks.alive = false;
      if (change === 'busy') mocks.safe.mockResolvedValue({ isSafe: false });
      if (change === 'cwd') mocks.targetCwd.mockResolvedValue('/other');
      if (change === 'pane') mocks.panePid.mockResolvedValue(99);
      if (change === 'removed') mocks.layout.mockResolvedValue({ root: [] });
      if (change === 'input') mocks.activity.mockReturnValue(123);
      return true;
    });
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('Prepared terminal changed');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.bind).not.toHaveBeenCalled();
    expect(mocks.workspaces[0].agentProcessTransfers?.[0].phase).toBe('stopped');
    expect(mocks.events).not.toContain('save:dispatching');
    mocks.safe.mockResolvedValue({ isSafe: true }); mocks.targetCwd.mockResolvedValue('/repo');
    mocks.panePid.mockResolvedValue(8);
    mocks.layout.mockResolvedValue({ root: [{ id: 'pane', tabs: [{ id: 'tab', sessionName: 'target' }] }] });
    await manageAgentProcess('adopt', identity);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledTimes(1);
  });
  it('returns to stopped if the target changes while dispatching is persisted, without sending', async () => {
    const save = mocks.save.getMockImplementation()!;
    mocks.save.mockImplementation(async (id, transfer) => {
      await save(id, transfer);
      if (transfer.phase === 'dispatching') mocks.safe.mockResolvedValue({ isSafe: false });
    });
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('Prepared terminal changed');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.workspaces[0].agentProcessTransfers?.[0].phase).toBe('stopped');
  });
  it('persists preparation before stopping and resumes the exact session only after exit', async () => {
    expect(await manageAgentProcess('adopt', identity)).toEqual({ workspaceId: 'ws', tabId: 'tab' });
    expect(mocks.events).toEqual(['save:prepared', 'kill', 'save:stopped', 'save:dispatching', 'send', 'save:started']);
    expect(kill).toHaveBeenCalledExactlyOnceWith(identity.pid, 'SIGTERM');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.build).toHaveBeenCalledWith(session.sessionId, { workspaceId: 'ws' });
    expect(mocks.add).toHaveBeenCalledWith('ws', 'pane', expect.any(String), '/repo', 'terminal');
    expect(mocks.bind).toHaveBeenCalledWith('target', expect.any(Object), session);
    expect(mocks.patch).toHaveBeenCalledWith('ws', 'pane', 'tab', { panelType: 'codex-cli' });
  });
  it('does not stop anything if preflight, transcript or persistence fails', async () => {
    mocks.preflight.mockResolvedValue({ installed: false });
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('not available');
    mocks.preflight.mockResolvedValue({ installed: true });
    mocks.access.mockRejectedValueOnce(new Error('transcript denied'));
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('transcript denied');
    mocks.save.mockRejectedValue(new Error('disk full'));
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('disk full');
    expect(kill).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('rejects PID reuse and changed sessions without signaling', async () => {
    mocks.processes.mockResolvedValue([{ ...row, startedAt: '2026-10-20T10:00:00.000Z' }]);
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('identity changed');
    mocks.processes.mockResolvedValue([row]); mocks.resolve.mockResolvedValue({ ...session, sessionId: 'other' });
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('session changed');
    expect(kill).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('does not force-kill or resume when the source ignores SIGTERM', async () => {
    kill.mockImplementation(() => true);
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('did not exit');
    expect(kill).toHaveBeenCalledExactlyOnceWith(identity.pid, 'SIGTERM');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.workspaces[0].agentProcessTransfers?.[0].phase).toBe('prepared');
  });
  it('never repeats an uncertain dispatch and can finish once the exact target session is detected', async () => {
    mocks.send.mockRejectedValueOnce(new Error('tmux failed'));
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('tmux failed');
    expect(mocks.workspaces[0].agentProcessTransfers?.[0].phase).toBe('dispatching');
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('delivery is uncertain');
    mocks.running.mockResolvedValue(true); mocks.detect.mockResolvedValue({ sessionId: session.sessionId });
    await manageAgentProcess('adopt', identity);
    expect(kill).toHaveBeenCalledTimes(1); expect(mocks.add).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('serializes duplicate requests and sends only one resume command', async () => {
    const results = await Promise.all([manageAgentProcess('adopt', identity), manageAgentProcess('adopt', identity)]);
    expect(results[0]).toEqual(results[1]); expect(mocks.send).toHaveBeenCalledTimes(1); expect(kill).toHaveBeenCalledTimes(1);
  });
  it('refuses to take over a busy target, even if it is the same provider', async () => {
    mocks.running.mockResolvedValue(true); mocks.detect.mockResolvedValue({ sessionId: 'other' });
    await expect(manageAgentProcess('adopt', identity)).rejects.toThrow('different or unidentified');
    expect(kill).not.toHaveBeenCalled(); expect(mocks.bind).not.toHaveBeenCalled();
  });
  it('opens managed processes without migration and stops only the selected PID', async () => {
    mocks.scan.mockResolvedValue({ processes: [{ ...source, managed: true, workspaceId: 'ws' }] });
    expect(await manageAgentProcess('adopt', identity)).toEqual({ workspaceId: 'ws' });
    expect(kill).not.toHaveBeenCalled();
    expect(await manageAgentProcess('stop', identity)).toEqual({ stopped: true });
    expect(kill).toHaveBeenCalledExactlyOnceWith(identity.pid, 'SIGTERM');
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
