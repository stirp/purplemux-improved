import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({
  status: { workspaceId: 'ws1', agentSessionId: 'session1', cliState: 'idle' },
  capture: vi.fn(async () => '› Ask Codex\n\n  model · Context 40% used\n  ? for shortcuts\n'),
}));
vi.mock('@/lib/cli-utils', () => ({ findTab: async () => ({ tab: { panelType: 'codex-cli', sessionName: 'tmux-session' } }) }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => ({ tab1: mocks.status }) }) }));
vi.mock('@/lib/tmux', () => ({ capturePaneContent: mocks.capture }));
import handler from '@/pages/api/codex/status-line';
const req = { method: 'GET', query: { workspaceId: 'ws1', tabId: 'tab1', sessionId: 'session1' } } as unknown as NextApiRequest;
const response = () => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.status = { workspaceId: 'ws1', agentSessionId: 'session1', cliState: 'idle' };
});
describe('native Codex status line API', () => {
  it.each(['busy', 'idle', 'ready-for-review'])('reads the same terminal footer in %s state', async (cliState) => {
    mocks.status.cliState = cliState;
    const res = response();
    await handler(req, res as unknown as NextApiResponse);
    expect(mocks.capture).toHaveBeenCalledWith('tmux-session');
    expect(res.json).toHaveBeenCalledWith({ active: true, text: 'model · Context 40% used' });
  });
  it('does not capture a replaced or exited session', async () => {
    mocks.status.agentSessionId = 'new-session';
    const res = response();
    await handler(req, res as unknown as NextApiResponse);
    expect(mocks.capture).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ active: false, text: null });
  });
  it('rejects captured text if the session changed during capture', async () => {
    mocks.capture.mockImplementationOnce(async () => {
      mocks.status.agentSessionId = 'new-session';
      return '› Ask Codex\n\n  old-model\n  ? for shortcuts';
    });
    const res = response();
    await handler(req, res as unknown as NextApiResponse);
    expect(res.json).toHaveBeenCalledWith({ active: false, text: null });
  });
});
