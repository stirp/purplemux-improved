import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({
  sendImmediately: vi.fn(async () => {}), enqueue: vi.fn(), flush: vi.fn(),
}));
vi.mock('@/lib/cli-utils', () => ({ findTab: async () => ({ tab: { sessionName: 'tmux-1', panelType: 'codex-cli' } }) }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => ({ tab1: {
  cliState: 'busy', workspaceId: 'ws1', agentSessionId: 'agent1', agentProviderId: 'codex',
} }) }) }));
vi.mock('@/lib/input-queue-server', () => ({ getInputQueue: () => ({ ...mocks, snapshot: () => ({ messages: [], sending: false, error: null }) }) }));
import handler from '@/pages/api/input-queue';
const response = () => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
const request = (agentSessionId = 'agent1') => ({
  method: 'POST', query: { workspaceId: 'ws1', tabId: 'tab1' },
  body: { action: 'send-immediate', id: 'question1', agentSessionId, text: 'Question\nAnswer', attachments: [] },
}) as unknown as NextApiRequest;
beforeEach(() => vi.clearAllMocks());

describe('immediate question answer API', () => {
  it('sends the supplied answer without enqueueing or flushing another message', async () => {
    const res = response();
    await handler(request(), res as unknown as NextApiResponse);
    expect(mocks.sendImmediately).toHaveBeenCalledWith(
      { tabId: 'tab1', workspaceId: 'ws1', sessionName: 'tmux-1', provider: 'codex', agentSessionId: 'agent1' },
      { id: 'question1', text: 'Question\nAnswer', attachments: [] },
    );
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(mocks.flush).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('rejects stale question submissions after the tab changes sessions', async () => {
    const res = response();
    await handler(request('old-session'), res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(mocks.sendImmediately).not.toHaveBeenCalled();
  });
  it('reports delivery failures rather than marking the answer submitted', async () => {
    mocks.sendImmediately.mockRejectedValueOnce(new Error('Disconnected'));
    const res = response();
    await handler(request(), res as unknown as NextApiResponse);
    expect(res.status).toHaveBeenCalledWith(409);
  });
});
