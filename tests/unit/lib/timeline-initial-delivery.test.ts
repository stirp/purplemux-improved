import { describe, expect, it, vi } from 'vitest';
import { deliverTimelineInit } from '@/lib/timeline-initial-delivery';
import type { ISessionStats, TTimelineServerMessage } from '@/types/timeline';

describe('timeline initial delivery', () => {
  it('delivers history while statistics are still pending, then sends statistics separately', async () => {
    let resolve!: (stats: ISessionStats) => void;
    const stats = new Promise<ISessionStats>((done) => { resolve = done; });
    const send = vi.fn();
    deliverTimelineInit({ type: 'timeline:init', entries: [], totalEntries: 0, sessionId: 'a', startByteOffset: 0, hasMore: false }, send, () => stats, () => true, vi.fn());
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ type: 'timeline:init', sessionStats: null });
    resolve({ sessionId: 'a', inputTokens: 10 });
    await stats;
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    expect(send.mock.calls[1][0]).toMatchObject({ type: 'timeline:stats-update', sessionStats: { inputTokens: 10 } });
  });

  it('discards statistics when the subscription changes or closes', async () => {
    const messages: TTimelineServerMessage[] = [];
    let current = true;
    deliverTimelineInit({ type: 'timeline:init', entries: [], totalEntries: 0, sessionId: 'a', startByteOffset: 0, hasMore: false }, (msg) => messages.push(msg), async () => ({ sessionId: 'a' }), () => current, vi.fn());
    current = false;
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(messages.map((msg) => msg.type)).toEqual(['timeline:init']);
  });

  it('keeps history available when statistics fail', async () => {
    const send = vi.fn();
    const error = vi.fn();
    deliverTimelineInit({ type: 'timeline:init', entries: [], totalEntries: 0, sessionId: 'a', startByteOffset: 0, hasMore: false }, send, async () => { throw new Error('read failed'); }, () => true, error);
    await vi.waitFor(() => expect(error).toHaveBeenCalledOnce());
    expect(send).toHaveBeenCalledOnce();
  });
});
