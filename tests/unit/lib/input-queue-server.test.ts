import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => {}),
  paste: vi.fn(async () => {}),
  exists: vi.fn(async () => true),
  capture: vi.fn(async () => '›\n\n? for shortcuts'),
  receipt: vi.fn(async () => ({ received: false, completed: false })),
  status: { cliState: 'busy', workspaceId: 'ws', agentProviderId: 'codex' },
}));
vi.mock('@/lib/tmux', () => ({ sendRawKeys: mocks.send, pasteText: mocks.paste, hasSession: mocks.exists, capturePaneContent: mocks.capture,
  checkTerminalProcess: async () => ({ isSafe: false, processName: 'codex' }),
}));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => ({ tab: mocks.status }) }) }));
vi.mock('@/lib/codex-input-receipt', () => ({ createCodexInputReceipt: () => mocks.receipt }));

import { getInputQueue } from '@/lib/input-queue-server';

const globals = globalThis as unknown as { __purplemuxInputQueue?: unknown };
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  mocks.receipt.mockReset().mockImplementation(async () => ({ received: mocks.send.mock.calls.length > 0, completed: false }));
  mocks.capture.mockResolvedValue('›\n\n? for shortcuts');
  delete globals.__purplemuxInputQueue;
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  delete globals.__purplemuxInputQueue;
});

describe('queued terminal input delivery', () => {
  it('does not press Enter after the session changes during the paste delay', async () => {
    mocks.status = { cliState: 'idle', workspaceId: 'ws', agentProviderId: 'codex' };
    mocks.receipt.mockResolvedValueOnce({ received: false, completed: false });
    mocks.receipt.mockRejectedValueOnce(new Error('Session changed'));
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' }, { id: 'first', text: 'message', attachments: [] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.paste).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(queue.snapshot('tab')).toMatchObject({ messages: [{ id: 'first' }], error: 'sendFailed' });
  });

  it('recovers from a late receipt after timeout without rewriting the message', async () => {
    mocks.status = { cliState: 'idle', workspaceId: 'ws', agentProviderId: 'codex' };
    mocks.receipt.mockResolvedValue({ received: false, completed: false });
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' }, { id: 'late', text: 'message', attachments: [] });
    await vi.advanceTimersByTimeAsync(32_000);
    expect(queue.snapshot('tab').error).toBe('deliveryUnconfirmed');
    mocks.receipt.mockResolvedValue({ received: true, completed: true });
    await vi.advanceTimersByTimeAsync(5000);
    expect(queue.snapshot('tab')).toMatchObject({ messages: [], sending: false, error: null });
    expect(mocks.paste).toHaveBeenCalledTimes(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });

  it('retains unacknowledged input, reports the timeout and never automatically pastes again', async () => {
    mocks.status = { cliState: 'idle', workspaceId: 'ws', agentProviderId: 'codex' };
    mocks.receipt.mockResolvedValue({ received: false, completed: false });
    const queue = getInputQueue();
    const target = { tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' as const };
    queue.enqueue(target, { id: 'first', text: 'lost message', attachments: [] });
    queue.enqueue(target, { id: 'second', text: 'follow up', attachments: [] });
    await vi.advanceTimersByTimeAsync(32_000);
    expect(mocks.paste).toHaveBeenCalledExactlyOnceWith('session', 'lost message');
    expect(queue.snapshot('tab')).toMatchObject({ messages: [{ id: 'first' }, { id: 'second' }], sending: false, error: 'deliveryUnconfirmed' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    mocks.receipt.mockResolvedValue({ received: true, completed: true });
    await queue.flush('tab', true);
    expect(mocks.paste).toHaveBeenCalledTimes(1);
    expect(queue.snapshot('tab')).toMatchObject({ messages: [{ id: 'second' }], error: null });
  });

  it('retains input without pasting into a terminal that is not ready', async () => {
    mocks.status = { cliState: 'idle', workspaceId: 'ws', agentProviderId: 'codex' };
    mocks.capture.mockResolvedValue('Select an option\n1. Continue\n2. Exit');
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' }, { id: 'first', text: 'message', attachments: [] });
    await queue.flush('tab');
    expect(mocks.paste).not.toHaveBeenCalled();
    expect(queue.snapshot('tab')).toMatchObject({ error: 'terminalNotReady', messages: [{ id: 'first' }] });
  });

  it('keeps the message visible until the actual receipt arrives', async () => {
    mocks.status = { cliState: 'idle', workspaceId: 'ws', agentProviderId: 'codex' };
    mocks.receipt.mockResolvedValue({ received: false, completed: false });
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' }, { id: 'first', text: 'message', attachments: [] });
    await vi.advanceTimersByTimeAsync(12_000);
    expect(queue.snapshot('tab')).toMatchObject({ messages: [{ id: 'first' }], sending: true, error: null });
    mocks.receipt.mockResolvedValue({ received: true, completed: false });
    await vi.advanceTimersByTimeAsync(500);
    expect(queue.snapshot('tab')).toMatchObject({ messages: [], sending: false, error: null });
    expect(mocks.paste).toHaveBeenCalledTimes(1);
  });
  it.each(['claude', 'codex'] as const)('uses %s immediate submission without interrupting through Escape', async (provider) => {
    mocks.status = { cliState: 'busy', workspaceId: 'ws', agentProviderId: provider };
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider }, { id: '1', text: 'additional\ncontext', attachments: [] });
    const sent = queue.flush('tab', true);
    await vi.advanceTimersByTimeAsync(250);
    await sent;
    expect(mocks.paste).toHaveBeenCalledWith('session', 'additional\ncontext');
    expect(mocks.send.mock.calls).toEqual([
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
    expect(mocks.paste).toHaveBeenCalledWith('session', 'next task');
    expect(mocks.send.mock.calls).toEqual([['session', 'Enter']]);
  });

  it('retains the message without writing when the terminal session is missing', async () => {
    mocks.status = { cliState: 'idle', workspaceId: 'ws', agentProviderId: 'codex' };
    mocks.exists.mockResolvedValueOnce(false);
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' }, { id: '1', text: 'next task', attachments: [] });
    await queue.flush('tab');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.paste).not.toHaveBeenCalled();
    expect(queue.snapshot('tab')).toMatchObject({ error: 'sendFailed', messages: [{ id: '1' }] });
  });

  it('keeps a failed paste queued and does not submit a partial message', async () => {
    mocks.status = { cliState: 'idle', workspaceId: 'ws', agentProviderId: 'codex' };
    mocks.paste.mockRejectedValueOnce(new Error('Paste failed'));
    const queue = getInputQueue();
    queue.enqueue({ tabId: 'tab', workspaceId: 'ws', sessionName: 'session', provider: 'codex' },
      { id: 'long', text: '中'.repeat(100_000), attachments: [] });
    await queue.flush('tab');
    expect(mocks.send).not.toHaveBeenCalled();
    expect(queue.snapshot('tab')).toMatchObject({ error: 'sendFailed', messages: [{ id: 'long' }] });
  });
});
