import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ detect: vi.fn(), capture: vi.fn(), find: vi.fn() }));
vi.mock('@/lib/cli-utils', () => ({ findTab: mocks.find }));
vi.mock('@/lib/tmux', () => ({ getSessionPanePid: async () => 42, capturePaneContent: mocks.capture }));
vi.mock('@/lib/providers/claude/session-detection', () => ({ detectActiveSession: mocks.detect }));
import handler from '@/pages/api/claude/status-line';
async function request() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method: 'GET', query: { workspaceId: 'ws1', tabId: 'tab1', sessionId: 's1' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue({ tab: { panelType: 'claude-code', sessionName: 'tmux' } });
  mocks.detect.mockResolvedValue({ status: 'running', sessionId: 's1' });
  mocks.capture.mockResolvedValue('────────────────────\n❯ Draft\n────────────────────\nMy status\n⏵⏵ bypass permissions on');
});
describe('Claude status line API', () => {
  it('reads the live matching session footer', async () => {
    expect((await request()).json).toHaveBeenCalledWith({ active: true, text: 'My status' });
  });
  it('does not capture a replaced session', async () => {
    mocks.detect.mockResolvedValue({ status: 'running', sessionId: 'other' });
    expect((await request()).json).toHaveBeenCalledWith({ active: false, text: null });
    expect(mocks.capture).not.toHaveBeenCalled();
  });
  it('discards capture when the agent exits during the read', async () => {
    mocks.detect.mockResolvedValueOnce({ status: 'running', sessionId: 's1' }).mockResolvedValueOnce({ status: 'not-running' });
    expect((await request()).json).toHaveBeenCalledWith({ active: false, text: null });
  });
  it('preserves active state during a temporary redraw without a footer', async () => {
    mocks.capture.mockResolvedValue('Select an option');
    expect((await request()).json).toHaveBeenCalledWith({ active: true, text: null });
  });
});
