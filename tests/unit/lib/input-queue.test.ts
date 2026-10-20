import { describe, expect, it, vi } from 'vitest';
import { InputDeliveryError, InputQueue, type IInputTarget, type IQueuedInput } from '@/lib/input-queue';
import type { TCliState } from '@/types/timeline';

const target: IInputTarget = { tabId: 'tab1', workspaceId: 'ws1', sessionName: 'session1', provider: 'codex', agentSessionId: 'agent1' };
const message = (id: string): IQueuedInput => ({ id, text: `message ${id}`, attachments: [] });
const setup = (state: TCliState = 'busy') => {
  const status = { cliState: state, workspaceId: 'ws1', agentSessionId: 'agent1', agentProviderId: 'codex', eventSeq: 1 };
  const deliver = vi.fn(async () => {});
  const queue = new InputQueue(() => status, deliver);
  return { status, deliver, queue };
};

describe('session input queue', () => {
  it('keeps the original attempt boundary on explicit retry and cleans metadata when the tab disappears', async () => {
    let exists = true;
    const status = { cliState: 'idle' as const, workspaceId: 'ws1', agentSessionId: 'agent1', agentProviderId: 'codex' };
    const deliver = vi.fn(async () => ({ completed: true }));
    deliver.mockRejectedValueOnce(new InputDeliveryError('deliveryUnconfirmed'));
    const queue = new InputQueue(() => exists ? status : undefined, deliver);
    queue.enqueue(target, message('retry'));
    await queue.tick();
    const attempts = queue.snapshot(target.tabId).attempts;
    await queue.flush(target.tabId, true);
    expect(queue.snapshot(target.tabId).attempts).toEqual(attempts);
    expect(deliver.mock.calls[0]).toEqual(deliver.mock.calls[1]);
    exists = false;
    await queue.tick();
    expect(queue.snapshot(target.tabId).attempts).toEqual([]);
  });

  it('publishes attempt boundaries only after delivery begins and retains them after dequeue', async () => {
    const { queue, status } = setup('busy');
    queue.enqueue(target, message('first'));
    queue.enqueue(target, message('second'));
    expect(queue.snapshot(target.tabId).attempts).toEqual([]);
    status.cliState = 'idle';
    await queue.tick();
    expect(queue.snapshot(target.tabId).attempts).toEqual([{ id: 'first', at: expect.any(Number) }]);
    expect(queue.snapshot(target.tabId).messages).toEqual([message('second')]);
    queue.remove(target.tabId, 'second');
    status.eventSeq++;
    await queue.tick();
    expect(queue.snapshot(target.tabId).attempts).toEqual([{ id: 'first', at: expect.any(Number) }]);
  });

  it('retains explicit cancellation in snapshots without treating successful delivery as cancellation', async () => {
    const { queue, status } = setup('busy');
    queue.enqueue(target, message('cancel'));
    queue.remove(target.tabId, 'cancel');
    await queue.tick();
    expect(queue.snapshot(target.tabId)).toMatchObject({ messages: [], canceledIds: ['cancel'] });
    expect(queue.hasPendingInput(target.tabId)).toBe(false);
    queue.enqueue(target, message('cancel'));
    expect(queue.snapshot(target.tabId).messages).toEqual([]);
    queue.enqueue(target, message('delivered'));
    status.cliState = 'idle';
    await queue.tick();
    status.eventSeq++;
    await queue.tick();
    expect(queue.snapshot(target.tabId)).toMatchObject({ messages: [], canceledIds: ['cancel'] });
  });

  it('does not use a canceled attempt receipt to acknowledge the next identical message', async () => {
    const status = { cliState: 'idle' as const, workspaceId: 'ws1', agentSessionId: 'agent1', agentProviderId: 'codex' };
    const deliver = vi.fn(async () => { throw new InputDeliveryError('deliveryUnconfirmed'); });
    const receipt = vi.fn(async () => ({ received: true, completed: true }));
    const queue = new InputQueue(() => status, deliver, receipt);
    queue.enqueue(target, { ...message('1'), text: 'same' });
    queue.enqueue(target, { ...message('2'), text: 'same' });
    await queue.tick();
    queue.remove(target.tabId, '1');
    await queue.tick();
    expect(receipt).not.toHaveBeenCalled();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(queue.snapshot(target.tabId).messages).toEqual([{ ...message('2'), text: 'same' }]);
  });

  it('protects sent input until its completion is observed even when the visible queue is empty', async () => {
    const { queue, status } = setup('idle');
    expect(queue.hasPendingInput(target.tabId)).toBe(false);
    queue.enqueue(target, message('1'));
    expect(queue.hasPendingInput(target.tabId)).toBe(true);
    await queue.tick();
    expect(queue.snapshot(target.tabId).messages).toEqual([]);
    expect(queue.hasPendingInput(target.tabId)).toBe(true);
    status.eventSeq += 2;
    await queue.tick();
    expect(queue.hasPendingInput(target.tabId)).toBe(false);
  });
  it('sends a question answer immediately without consuming queued messages', async () => {
    const { queue, deliver } = setup();
    queue.enqueue(target, message('queued'));
    await queue.sendImmediately(target, message('answer'));
    expect(deliver).toHaveBeenCalledExactlyOnceWith(target, message('answer'), true);
    expect(queue.snapshot(target.tabId).messages).toEqual([message('queued')]);
  });

  it('rejects an immediate answer for a replaced session', async () => {
    const { queue, deliver, status } = setup();
    status.agentSessionId = 'different-session';
    await expect(queue.sendImmediately(target, message('answer'))).rejects.toThrow();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('serializes immediate answers with normal queue delivery', async () => {
    const { queue, deliver } = setup('idle');
    let release!: () => void;
    deliver.mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; }));
    queue.enqueue(target, message('queued'));
    const sending = queue.sendImmediately(target, message('answer'));
    await queue.tick();
    await expect(queue.sendImmediately(target, message('duplicate'))).rejects.toThrow();
    expect(deliver).toHaveBeenCalledTimes(1);
    release();
    await sending;
    await queue.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it('reports a failed immediate answer and never automatically retries it', async () => {
    const { queue, deliver } = setup('idle');
    queue.enqueue(target, message('queued'));
    deliver.mockRejectedValueOnce(new Error('Disconnected'));
    await expect(queue.sendImmediately(target, message('answer'))).rejects.toThrow('Disconnected');
    await queue.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(queue.snapshot(target.tabId)).toMatchObject({ messages: [message('queued')], error: 'sendFailed', sending: false });
  });

  it('waits for completion, sends in order, and waits for the next turn before sending again', async () => {
    const { status, deliver, queue } = setup();
    queue.enqueue(target, message('1'));
    queue.enqueue(target, message('2'));
    await queue.tick();
    expect(deliver).not.toHaveBeenCalled();
    status.cliState = 'ready-for-review';
    await queue.tick();
    expect(deliver).toHaveBeenCalledExactlyOnceWith(target, message('1'), false, expect.any(Number));
    await queue.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
    status.cliState = 'busy';
    await queue.tick();
    status.cliState = 'idle';
    await queue.tick();
    expect(deliver).toHaveBeenLastCalledWith(target, message('2'), false, expect.any(Number));
  });

  it('can submit the next queued message immediately while busy without draining the rest', async () => {
    const { queue, deliver } = setup();
    queue.enqueue(target, message('1'));
    queue.enqueue(target, message('2'));
    await queue.flush(target.tabId, true);
    expect(deliver).toHaveBeenCalledExactlyOnceWith(target, message('1'), true, expect.any(Number));
    expect(queue.snapshot(target.tabId).messages).toEqual([message('2')]);
  });

  it('uses event sequence changes when a short turn finishes between polls', async () => {
    const { queue, status, deliver } = setup('idle');
    queue.enqueue(target, message('1'));
    queue.enqueue(target, message('2'));
    await queue.tick();
    status.eventSeq += 2;
    await queue.tick();
    expect(deliver).toHaveBeenCalledTimes(2);
  });

  it.each<TCliState>(['inactive', 'unknown', 'needs-input', 'cancelled'])('does not auto-submit in %s state', async (state) => {
    const { queue, deliver } = setup(state);
    queue.enqueue(target, message('1'));
    await queue.tick();
    expect(deliver).not.toHaveBeenCalled();
    expect(queue.snapshot(target.tabId).messages).toHaveLength(1);
  });

  it('retains text and attachments on failure and does not automatically retry a partial send', async () => {
    const { queue, deliver } = setup('idle');
    const item = { ...message('1'), attachments: [{ path: '/upload/test.png', filename: 'test.png' }] };
    deliver.mockRejectedValueOnce(new Error('disconnected'));
    queue.enqueue(target, item);
    await queue.tick();
    await queue.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(queue.snapshot(target.tabId)).toMatchObject({ messages: [item], error: 'sendFailed', sending: false });
  });

  it('blocks stale messages after the agent session changes, even on explicit submission', async () => {
    const { queue, status, deliver } = setup('idle');
    queue.enqueue(target, message('1'));
    status.agentSessionId = 'agent2';
    await queue.flush(target.tabId, true);
    expect(deliver).not.toHaveBeenCalled();
    expect(queue.snapshot(target.tabId).error).toBe('sessionChanged');
  });

  it('deduplicates enqueues and supports cancellation', async () => {
    const { queue, deliver } = setup('idle');
    queue.enqueue(target, message('1'));
    queue.enqueue(target, message('1'));
    expect(queue.snapshot(target.tabId).messages).toHaveLength(1);
    queue.remove(target.tabId, '1');
    await queue.tick();
    expect(deliver).not.toHaveBeenCalled();
  });

  it('does not double-send during overlapping polls or immediate submission', async () => {
    const { queue, deliver } = setup('idle');
    let finish!: () => void;
    deliver.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    queue.enqueue(target, message('1'));
    const first = queue.tick();
    await queue.tick();
    await queue.flush(target.tabId, true);
    queue.remove(target.tabId, '1');
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(queue.snapshot(target.tabId).messages).toHaveLength(1);
    expect(queue.snapshot(target.tabId).canceledIds).toEqual([]);
    finish();
    await first;
    expect(queue.snapshot(target.tabId).messages).toHaveLength(0);
  });

  it('isolates queues per tab', async () => {
    const { queue } = setup();
    queue.enqueue(target, message('1'));
    queue.enqueue({ ...target, tabId: 'tab2' }, message('2'));
    queue.remove(target.tabId, '1');
    expect(queue.snapshot('tab2').messages).toEqual([message('2')]);
  });
});
