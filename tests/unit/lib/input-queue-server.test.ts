import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => {}),
  exists: vi.fn(async () => true),
  capture: vi.fn(async () => ''),
  status: { cliState: 'busy', workspaceId: 'ws', agentProviderId: 'codex' },
}));
vi.mock('@/lib/tmux', () => ({ sendRawKeys: mocks.send, hasSession: mocks.exists, capturePaneContent: mocks.capture }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => ({ tab: mocks.status }) }) }));

import { getInputQueue } from '@/lib/input-queue-server';

const globals = globalThis as unknown as { __purplemuxInputQueue?: unknown };
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  delete globals.__purplemuxInputQueue;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  delete globals.__purplemuxInputQueue;
});

describe('queued terminal input delivery', () => {
  it.each(['claude', 'codex'] as const)('uses %s immediate submission without interrupting through Escape', async (provider) => {
    mocks.status = { cliState: 'busy', workspaceId: 'ws', agentProviderId: provider };
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider }, { id: '1', text: 'additional\ncontext', attachments: [] });
    const sent = queue.flush('tab', true);
    await vi.advanceTimersByTimeAsync(250);
    await sent;
    expect(mocks.send.mock.calls).toEqual([
      ['session', '\x1b[200~additional\ncontext\x1b[201~'],
      ...(provider === 'claude' ? [['session', 'C-x'], ['session', 'C-s']] : [['session', 'Enter']]),
    ]);
    expect(queue.snapshot('tab').messages).toHaveLength(0);
  });

  it('automatically sends on the server without a mounted input component', async () => {
    mocks.status = { cliState: 'busy', workspaceId: 'ws', agentProviderId: 'codex' };
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' }, { id: '1', text: 'next task', attachments: [] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.status.cliState = 'ready-for-review';
    await vi.advanceTimersByTimeAsync(750);
    expect(mocks.send.mock.calls).toEqual([['session', '\x1b[200~next task\x1b[201~'], ['session', 'Enter']]);
  });

  it('retains the message without writing when the terminal session is missing', async () => {
    mocks.status = { cliState: 'idle', workspaceId: 'ws', agentProviderId: 'codex' };
    mocks.exists.mockResolvedValueOnce(false);
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' }, { id: '1', text: 'next task', attachments: [] });
    await queue.flush('tab');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(queue.snapshot('tab')).toMatchObject({ error: 'sendFailed', messages: [{ id: '1' }] });
  });
});
