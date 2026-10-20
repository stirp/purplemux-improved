import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(), resume: vi.fn(), statusInit: vi.fn(), hooks: vi.fn(), token: vi.fn(), prompts: vi.fn(),
}));
vi.mock('next', () => ({ default: () => ({
  getRequestHandler: () => (_req: unknown, res: { end: (text: string) => void }) => res.end('ready'),
  getUpgradeHandler: () => vi.fn(), prepare: mocks.prepare,
}) }));
vi.mock('@/lib/pristine-env', () => ({}));
vi.mock('@/lib/auth', () => ({ verifySessionToken: vi.fn(), SESSION_COOKIE: 'test', extractCookie: vi.fn() }));
vi.mock('@/lib/terminal-server', () => ({ handleConnection: vi.fn(), gracefulShutdown: vi.fn() }));
vi.mock('@/lib/install-server', () => ({ handleInstallConnection: vi.fn(), gracefulInstallShutdown: vi.fn() }));
vi.mock('@/lib/timeline-server', () => ({ handleTimelineConnection: vi.fn(), gracefulTimelineShutdown: vi.fn() }));
vi.mock('@/lib/sync-server', () => ({ handleSyncConnection: vi.fn(), gracefulSyncShutdown: vi.fn(), enqueueSystemToast: vi.fn() }));
vi.mock('@/lib/status-server', () => ({ handleStatusConnection: vi.fn(), gracefulStatusShutdown: vi.fn() }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ init: mocks.statusInit }) }));
vi.mock('@/lib/hook-settings', () => ({ ensureHookSettings: mocks.hooks, removePortFile: vi.fn() }));
vi.mock('@/lib/cli-token', () => ({ getCliToken: mocks.token }));
vi.mock('@/lib/lock', () => ({ acquireLock: vi.fn(), releaseLock: vi.fn(), registerLockCleanup: vi.fn() }));
vi.mock('@/lib/tmux', () => ({ scanSessions: vi.fn(), applyConfig: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({ initWorkspaceStore: vi.fn(), getWorkspaces: async () => ({ workspaces: [] }), writeAllWorkspacePrompts: mocks.prompts }));
vi.mock('@/lib/auto-resume', () => ({ autoResumeOnStartup: mocks.resume }));
vi.mock('@/lib/auth-credentials', () => ({ initAuthCredentials: async () => null }));
vi.mock('@/lib/config-store', () => ({ initConfigStore: vi.fn(), getConfig: async () => ({}) }));
vi.mock('@/lib/network-access', () => ({ listInterfaceIps: () => [], resolveBindPlan: () => ({ host: '127.0.0.1' }) }));
vi.mock('@/lib/access-filter', () => ({ getCurrentSpec: () => ({}), initAccessFilter: vi.fn(), isRequestAllowed: () => true, setBoundHost: vi.fn() }));
vi.mock('@/lib/preflight', () => ({ initShellPath: vi.fn() }));
vi.mock('@/lib/uploads-store', () => ({ cleanupExpiredUploads: async () => ({ deleted: 0 }) }));
vi.mock('@/lib/idle-tab-reclaimer', () => ({ startIdleTabReclamation: vi.fn(), stopIdleTabReclamation: vi.fn() }));
vi.mock('@/lib/session-stats', () => ({ cleanupOrphanSessionStats: async () => {} }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn() }) }));
vi.mock('@/lib/scheduled-task-scheduler', () => ({ getScheduledTaskScheduler: () => ({ start: vi.fn(), stop: vi.fn() }) }));
vi.mock('@/lib/app-update-server', () => ({ initAppUpdates: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('waits for HTTP, status, hooks, token and workspace prompts before resuming agents', async () => {
  vi.stubEnv('__PMUX_ELECTRON', '1');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('PORT', '0');
  vi.stubEnv('PURPLEMUX_CLI', '1');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  // Keep server signal handlers out of the test runner while using a real HTTP listener.
  const on = process.on.bind(process);
  vi.spyOn(process, 'on').mockImplementation((event, listener) =>
    event === 'SIGINT' || event === 'SIGTERM' ? process : on(event, listener));
  let ready!: () => void;
  mocks.prepare.mockImplementation(() => new Promise<void>((resolve) => { ready = resolve; }));
  mocks.hooks.mockResolvedValue({ codexHookInstallFailed: false });
  mocks.resume.mockImplementation(async () => {
    expect(mocks.statusInit).toHaveBeenCalledTimes(1);
    expect(mocks.hooks).toHaveBeenCalledExactlyOnceWith(Number(process.env.PORT));
    expect(mocks.token).toHaveBeenCalledTimes(1);
    expect(mocks.prompts).toHaveBeenCalledTimes(1);
    expect(Number(process.env.PORT)).toBeGreaterThan(0);
    const response = await fetch(`http://127.0.0.1:${process.env.PORT}/`);
    expect(await response.text()).toBe('ready');
  });
  const { start } = await import('../../../server');
  const starting = start({ port: 0 });
  await vi.waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1));
  expect(mocks.resume).not.toHaveBeenCalled();
  ready();
  const server = await starting;
  try {
    expect(mocks.resume).toHaveBeenCalledTimes(1);
  } finally {
    await server.shutdown();
  }
});
