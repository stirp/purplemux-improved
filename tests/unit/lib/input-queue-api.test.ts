import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({
  sendImmediately: vi.fn(async () => {}), enqueue: vi.fn(), flush: vi.fn(),
  provider: 'codex', imageHash: vi.fn(),
}));
vi.mock('@/lib/cli-utils', () => ({ findTab: async () => ({ tab: { sessionName: 'tmux-1', panelType: 'codex-cli' } }) }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => ({ tab1: {
  cliState: 'busy', workspaceId: 'ws1', agentSessionId: 'agent1', agentProviderId: mocks.provider,
} }) }) }));
vi.mock('@/lib/input-queue-server', () => ({ getInputQueue: () => ({ ...mocks, snapshot: () => ({ messages: [], sending: false, error: null }) }) }));
vi.mock('@/lib/uploads-store', () => ({ getUploadImageHash: mocks.imageHash }));
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
beforeEach(() => { vi.clearAllMocks(); mocks.provider = 'codex'; });

describe('immediate question answer API', () => {
  it('derives Claude attachment identity on the server instead of trusting the caller', async () => {
    mocks.provider = 'claude';
    mocks.imageHash.mockResolvedValueOnce('server-hash');
    const req = request();
    req.body = { id: 'q', text: 'picture', attachments: [{ path: '/upload/image.png', filename: 'image.png', imageHash: 'forged' }] };
    const res = response();
    await handler(req, res as unknown as NextApiResponse);
    expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ provider: 'claude' }), expect.objectContaining({
      attachments: [{ path: '/upload/image.png', filename: 'image.png', imageHash: 'server-hash' }],
    }));
  });

  it('keeps unreadable Claude image input out of the queue and reports the read failure', async () => {
    mocks.provider = 'claude';
    mocks.imageHash.mockRejectedValueOnce(new Error('ENOENT'));
    const req = request();
    req.body = { id: 'q', text: '', attachments: [{ path: '/upload/image.png', filename: 'image.png' }] };
    const res = response();
    await handler(req, res as unknown as NextApiResponse);
    expect(mocks.enqueue).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ error: 'Could not read uploaded image' });
  });

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
