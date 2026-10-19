import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { createTimelineDelivery } from '@/lib/timeline-delivery';

const client = () => ({ readyState: WebSocket.OPEN, bufferedAmount: 0, send: vi.fn(), close: vi.fn() });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('timeline delivery backpressure', () => {
  it('retries without new file events, preserves order and isolates slow clients', () => {
    const slow = client();
    const fast = client();
    const delivery = createTimelineDelivery(slow as unknown as WebSocket);
    const other = createTimelineDelivery(fast as unknown as WebSocket);
    slow.bufferedAmount = 1024 * 1024;
    delivery.send('init');
    delivery.send('call');
    other.send('independent');
    vi.advanceTimersByTime(100);
    expect(slow.send).not.toHaveBeenCalled();
    expect(fast.send).toHaveBeenCalledWith('independent', expect.any(Function));
    slow.bufferedAmount = 0;
    delivery.send('result');
    vi.advanceTimersByTime(50);
    expect(slow.send.mock.calls.map(([data]) => data)).toEqual(['init', 'call', 'result']);
    expect(slow.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('pauses again when a send fills the socket and resumes the remaining queue', () => {
    const ws = client();
    ws.bufferedAmount = 1024 * 1024;
    const delivery = createTimelineDelivery(ws as unknown as WebSocket);
    delivery.send('first');
    delivery.send('second');
    ws.send.mockImplementationOnce(() => { ws.bufferedAmount = 1024 * 1024; });
    ws.bufferedAmount = 0;
    vi.advanceTimersByTime(50);
    expect(ws.send).toHaveBeenCalledTimes(1);
    ws.bufferedAmount = 0;
    vi.advanceTimersByTime(50);
    expect(ws.send.mock.calls.map(([data]) => data)).toEqual(['first', 'second']);
  });

  it.each(['timeout', 'bytes', 'messages'])('closes explicitly to trigger init recovery on %s', (reason) => {
    const ws = client();
    ws.bufferedAmount = 1024 * 1024;
    const delivery = createTimelineDelivery(ws as unknown as WebSocket);
    delivery.send('first');
    if (reason === 'timeout') vi.advanceTimersByTime(10_000);
    if (reason === 'bytes') delivery.send('中'.repeat(2 * 1024 * 1024));
    if (reason === 'messages') for (let i = 0; i < 256; i++) delivery.send('small');
    expect(ws.close).toHaveBeenCalledWith(1013, expect.stringContaining('resync'));
    ws.bufferedAmount = 0;
    delivery.send('after close');
    vi.advanceTimersByTime(100);
    expect(ws.send).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards old subscription data and releases timers on clear and dispose', () => {
    const ws = client();
    ws.bufferedAmount = 1024 * 1024;
    const delivery = createTimelineDelivery(ws as unknown as WebSocket);
    delivery.send('old subscription');
    delivery.clear();
    ws.bufferedAmount = 0;
    delivery.send('new subscription');
    expect(ws.send.mock.calls.map(([data]) => data)).toEqual(['new subscription']);
    ws.bufferedAmount = 1024 * 1024;
    delivery.send('pending');
    delivery.dispose();
    vi.advanceTimersByTime(10_000);
    expect(ws.close).not.toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])('recovers from send failure (asynchronous: %s)', (asyncError) => {
    const ws = client();
    const delivery = createTimelineDelivery(ws as unknown as WebSocket);
    ws.send.mockImplementation((_data, callback) => {
      if (asyncError) callback(new Error('failed'));
      else throw new Error('failed');
    });
    delivery.send('result');
    expect(ws.close).toHaveBeenCalledWith(1013, expect.any(String));
    expect(vi.getTimerCount()).toBe(0);
  });
});
