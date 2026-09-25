import { describe, expect, it, vi } from 'vitest';
import { InputQueue, type IInputTarget, type IQueuedInput } from '@/lib/input-queue';
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
    expect(deliver).toHaveBeenCalledExactlyOnceWith(target, message('1'), false);
    await queue.tick();
    expect(deliver).toHaveBeenCalledTimes(1);
    status.cliState = 'busy';
    await queue.tick();
    status.cliState = 'idle';
    await queue.tick();
    expect(deliver).toHaveBeenLastCalledWith(target, message('2'), false);
  });

  it('can submit the next queued message immediately while busy without draining the rest', async () => {
    const { queue, deliver } = setup();
    queue.enqueue(target, message('1'));
    queue.enqueue(target, message('2'));
    await queue.flush(target.tabId, true);
    expect(deliver).toHaveBeenCalledExactlyOnceWith(target, message('1'), true);
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
