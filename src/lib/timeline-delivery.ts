import { WebSocket } from 'ws';

const BACKPRESSURE_LIMIT = 1024 * 1024;
const MAX_QUEUE_BYTES = 4 * 1024 * 1024;
const MAX_QUEUE_MESSAGES = 256;
const RETRY_MS = 50;
const MAX_WAIT_MS = 10_000;

/** Each connection owns its queue; a slow client cannot stall the file watcher. */
export const createTimelineDelivery = (ws: WebSocket) => {
  let queue: { data: string; bytes: number; queuedAt: number }[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    queue = [];
    bytes = 0;
  };
  const dispose = () => { stopped = true; clear(); };
  const recover = () => {
    dispose();
    if (ws.readyState === WebSocket.OPEN) ws.close(1013, 'Timeline delivery stalled; reconnect to resync');
  };
  const flush = () => {
    timer = undefined;
    if (stopped || ws.readyState !== WebSocket.OPEN) { clear(); return; }
    if (queue.length && Date.now() - queue[0].queuedAt >= MAX_WAIT_MS) { recover(); return; }
    while (queue.length && ws.bufferedAmount < BACKPRESSURE_LIMIT) {
      const next = queue.shift()!;
      bytes -= next.bytes;
      try {
        ws.send(next.data, (error) => { if (error) recover(); });
      } catch { recover(); return; }
      if (stopped) return;
    }
    if (queue.length) timer = setTimeout(flush, RETRY_MS);
  };
  const send = (data: string) => {
    if (stopped || ws.readyState !== WebSocket.OPEN) return;
    // An uncongested init may exceed the queue budget; only buffered work is capped.
    if (!queue.length && ws.bufferedAmount < BACKPRESSURE_LIMIT) {
      try { ws.send(data, (error) => { if (error) recover(); }); } catch { recover(); }
      return;
    }
    const size = Buffer.byteLength(data);
    if (bytes + size > MAX_QUEUE_BYTES || queue.length >= MAX_QUEUE_MESSAGES) { recover(); return; }
    queue.push({ data, bytes: size, queuedAt: Date.now() });
    bytes += size;
    if (!timer) timer = setTimeout(flush, RETRY_MS);
  };
  return { send, clear, dispose };
};
