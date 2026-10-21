// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTimeline from '@/hooks/use-timeline';
import { InputQueue, type IQueuedInput } from '@/lib/input-queue';
import { clearTimelineDisplaySnapshot, getTimelineDisplaySnapshot, saveTimelineDisplaySnapshot, timelineDisplayKey } from '@/lib/timeline-display-cache';
import type { ITimelineUserMessage, TTimelineServerMessage } from '@/types/timeline';

class Socket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: Socket[] = [];
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() { Socket.instances.push(this); }
  message(msg: TTimelineServerMessage) { this.onmessage?.({ data: JSON.stringify(msg) }); }
}

const entry = (id: string): ITimelineUserMessage => ({ id, type: 'user-message', timestamp: 1, text: id });
let state: ReturnType<typeof useTimeline>;
const Harness = ({ id = 'a', session = 'pane' }: { id?: string | null; session?: string }) => {
  const timeline = useTimeline({ sessionName: session, panelType: 'codex-cli', agentSessionId: id, enabled: true });
  useEffect(() => { state = timeline; }, [timeline]);
  return createElement('div', null, timeline.entries.map((e) => e.id).join(','));
};
let root: Root;
let container: HTMLDivElement;
const key = timelineDisplayKey('codex-cli', 'pane', 'a');
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', Socket);
  Socket.instances = [];
  clearTimelineDisplaySnapshot(key);
  clearTimelineDisplaySnapshot(timelineDisplayKey('codex-cli', 'pane', 'b'));
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('timeline cached display and revalidation', () => {
  it('restores the original queued timestamp after mounting and remounting, then uses the native receipt time', async () => {
    vi.useFakeTimers();
    const createdAt = Date.parse('2026-10-21T10:00:00Z');
    const message = { id: 'queued', text: 'waiting', attachments: [], createdAt };
    const options = { queueMessage: message, autoHide: false, deliveryState: 'queued' as const };
    vi.setSystemTime(createdAt + 300_000);
    await act(async () => root.render(createElement(Harness)));
    await act(async () => state.addPendingUserMessage(message.text, options));
    expect(state.entries).toEqual([expect.objectContaining({ id: 'input-queued', timestamp: createdAt, pending: true })]);

    await act(async () => root.unmount());
    vi.setSystemTime(createdAt + 600_000);
    root = createRoot(container);
    await act(async () => root.render(createElement(Harness)));
    await act(async () => state.addPendingUserMessage(message.text, options));
    expect(state.entries).toEqual([expect.objectContaining({ id: 'input-queued', timestamp: createdAt, pending: true })]);

    const attemptedAt = createdAt + 700_000;
    vi.setSystemTime(attemptedAt);
    await act(async () => {
      state.addPendingUserMessage(message.text, { ...options, deliveryState: 'sending' });
      state.syncInputAttempts([{ id: message.id, at: attemptedAt }]);
    });
    expect(state.entries[0]).toMatchObject({ timestamp: createdAt, deliveryState: 'sending', attemptedAt });
    const actual = { ...entry('native'), text: message.text, timestamp: attemptedAt + 1000 };
    await act(async () => Socket.instances[1].message({ type: 'timeline:append', entries: [actual] }));
    expect(state.entries).toEqual([{ ...actual, id: 'input-queued' }]);
  });

  it('keeps the initial fallback time for legacy queue snapshots without createdAt', async () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-10-21T10:00:00Z');
    vi.setSystemTime(now);
    await act(async () => root.render(createElement(Harness)));
    const message: IQueuedInput = { id: 'legacy', text: 'waiting', attachments: [] };
    const options = { queueMessage: message, autoHide: false, deliveryState: 'queued' as const };
    await act(async () => state.addPendingUserMessage(message.text, options));
    expect(state.entries[0]).toMatchObject({ timestamp: now, pending: true });
    vi.setSystemTime(now + 60_000);
    await act(async () => state.addPendingUserMessage(message.text, { ...options, deliveryState: 'sending' }));
    expect(state.entries).toEqual([expect.objectContaining({ timestamp: now, deliveryState: 'sending' })]);
  });

  it('uses the submission time for pending messages without queue metadata', async () => {
    vi.useFakeTimers();
    const now = Date.parse('2026-10-21T10:00:00Z');
    vi.setSystemTime(now);
    await act(async () => root.render(createElement(Harness)));
    await act(async () => state.addPendingUserMessage('direct input', { autoHide: false }));
    expect(state.entries).toEqual([expect.objectContaining({ timestamp: now, pending: true })]);
  });

  it.each([false, true])('uses server attempt times even when a send finishes between queue polls (receiptFirst=%s)', async (receiptFirst) => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const status = { cliState: 'busy' as 'busy' | 'idle', workspaceId: 'ws', agentProviderId: 'codex', agentSessionId: 'a', eventSeq: 1 };
    const queue = new InputQueue(() => status, async () => ({ completed: true }));
    const target = { tabId: 'tab', workspaceId: 'ws', sessionName: 'pane', provider: 'codex' as const, agentSessionId: 'a' };
    const first = { id: 'first', text: 'same', attachments: [], createdAt: 1000 };
    const second = { ...first, id: 'second', createdAt: 1100 };
    queue.enqueue(target, first);
    queue.enqueue(target, second);
    vi.setSystemTime(1500);
    status.cliState = 'idle';
    await queue.tick();
    status.cliState = 'busy';
    await act(async () => root.render(createElement(Harness)));
    const actual = { ...entry('native-first'), timestamp: 2000, text: 'same' };
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', sessionId: 'a', totalEntries: 1, startByteOffset: 0, hasMore: false, entries: [actual] }));
    const syncQueue = async () => act(async () => {
      const snapshot = queue.snapshot('tab');
      for (const message of snapshot.messages) state.addPendingUserMessage(message.text, { queueMessage: message, autoHide: false, deliveryState: 'queued' });
      state.syncInputAttempts(snapshot.attempts);
    });
    await syncQueue();
    expect(state.entries).toHaveLength(2);
    expect(state.entries.find((e) => e.id === 'input-second')).toMatchObject({ pending: true });
    vi.setSystemTime(3000);
    status.cliState = 'idle';
    await queue.tick();
    await queue.tick();
    expect(queue.snapshot('tab').messages).toEqual([]);
    if (!receiptFirst) await syncQueue();
    const secondReceipt = { ...actual, id: 'native-second', timestamp: 3100 };
    await act(async () => Socket.instances[0].message({ type: 'timeline:append', entries: [secondReceipt] }));
    if (receiptFirst) await syncQueue();
    expect(state.entries).toEqual([actual, { ...secondReceipt, id: 'input-second' }]);
  });

  it.each(['snapshot-first', 'init-first', 'append-first'])('keeps never-attempted same-text input pending in a fresh client (%s)', async (order) => {
    await act(async () => root.render(createElement(Harness)));
    const message = { id: 'second', text: 'same', createdAt: 1100, attachments: [] };
    const syncQueue = async () => act(async () => state.addPendingUserMessage(message.text, { queueMessage: message, autoHide: false, deliveryState: 'queued' }));
    if (order === 'snapshot-first') await syncQueue();
    const actual = { ...entry('native-first'), text: 'same', timestamp: 2000 };
    await act(async () => Socket.instances[0].message(order === 'append-first'
      ? { type: 'timeline:append', entries: [actual] }
      : { type: 'timeline:init', sessionId: 'a', totalEntries: 1, startByteOffset: 0, hasMore: false, entries: [actual] }));
    if (order !== 'snapshot-first') await syncQueue();
    expect(state.entries).toHaveLength(2);
    expect(state.entries.find((e) => e.id === 'input-second')).toMatchObject({ pending: true, deliveryState: 'queued' });
    expect(state.entries.find((e) => e.id === 'native-first')).toEqual(actual);
  });

  it('does not reuse the first same-text receipt for a queued message after reconnect', async () => {
    await act(async () => root.render(createElement(Harness)));
    const first = { id: 'first', text: 'same', attachments: [], createdAt: 1000 };
    const second = { ...first, id: 'second', createdAt: 1100 };
    await act(async () => {
      state.addPendingUserMessage('same', { queueMessage: first, autoHide: false });
      state.addPendingUserMessage('same', { queueMessage: second, autoHide: false });
    });
    await act(async () => state.syncInputAttempts([{ id: 'first', at: 1500 }]));
    const actual = { ...entry('native-first'), timestamp: 2000, text: 'same' };
    await act(async () => Socket.instances[0].message({ type: 'timeline:append', entries: [actual] }));
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', sessionId: 'a', totalEntries: 1, startByteOffset: 0, hasMore: false,
      entries: [{ ...actual, id: 'regenerated-parser-id' }] }));
    await act(async () => state.addPendingUserMessage('same', { queueMessage: second, autoHide: false, deliveryState: 'queued' }));
    expect(state.entries).toHaveLength(2);
    expect(state.entries[0]).toMatchObject({ id: 'input-first' });
    expect(state.entries[0]).not.toHaveProperty('pending');
    expect(state.entries[1]).toMatchObject({ id: 'input-second', pending: true, deliveryState: 'queued' });
    await act(async () => state.syncInputAttempts([{ id: 'second', at: 2500 }]));
    await act(async () => Socket.instances[0].message({ type: 'timeline:append', entries: [{ ...actual, id: 'native-second', timestamp: 3000 }] }));
    expect(state.entries[1]).toMatchObject({ id: 'input-second', timestamp: 3000 });
    expect(state.entries[1]).not.toHaveProperty('pending');
  });

  it.each([false, true])('confirms Claude images when hashes arrive before/after the transcript (late=%s)', async (late) => {
    await act(async () => root.render(createElement(Harness)));
    const message = { id: 'claude-image', text: 'picture', createdAt: 1000,
      attachments: [{ path: '/home/test/.purplemux/uploads/ws/tab/image.png', filename: 'image.png' }] };
    const options = { queueMessage: message, autoHide: false, images: ['/api/uploads/ws/tab/image.png'] };
    await act(async () => state.addPendingUserMessage(message.text, options));
    await act(async () => state.syncInputAttempts([{ id: message.id, at: 1500 }]));
    const enrich = async () => act(async () => state.addPendingUserMessage(message.text, {
      ...options, queueMessage: { ...message, attachments: [{ ...message.attachments[0], imageHash: 'sha256-image' }] },
    }));
    if (!late) await enrich();
    await act(async () => Socket.instances[0].message({ type: 'timeline:append', entries: [{
      ...entry('native-image'), timestamp: 2000, text: 'picture', images: ['data:image/png;base64,aW1hZ2U='], imageHashes: ['sha256-image'],
    }] }));
    if (late) await enrich();
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ id: 'input-claude-image' });
    expect(state.entries[0]).not.toHaveProperty('pending');
  });

  it('reconciles a queue snapshot arriving after the transcript without duplicating the bubble', async () => {
    await act(async () => root.render(createElement(Harness)));
    const message = { id: 'late-queue', text: 'already received', attachments: [], createdAt: Date.now() };
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', sessionId: 'a', totalEntries: 1, startByteOffset: 0, hasMore: false,
      entries: [{ ...entry('native'), text: message.text, timestamp: message.createdAt + 1 }] }));
    await act(async () => {
      state.addPendingUserMessage(message.text, { queueMessage: message, autoHide: false });
      state.syncInputAttempts([{ id: message.id, at: message.createdAt }]);
    });
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toMatchObject({ id: 'input-late-queue' });
    expect(state.entries[0]).not.toHaveProperty('pending');
  });

  it('keeps queued input visible, updates its state, and confirms it only with a new matching record', async () => {
    vi.useFakeTimers();
    await act(async () => root.render(createElement(Harness)));
    const message = { id: 'queued', text: 'repeat', attachments: [], createdAt: Date.now() };
    const options = { queueMessage: message, autoHide: false, deliveryState: 'sending' as const };
    await act(async () => {
      state.addPendingUserMessage(message.text, options);
      state.syncInputAttempts([{ id: message.id, at: message.createdAt }]);
    });
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', sessionId: 'a', totalEntries: 1, startByteOffset: 0, hasMore: false,
      entries: [{ ...entry('previous'), text: 'repeat', timestamp: message.createdAt - 1000 }] }));
    expect(state.entries).toHaveLength(2);
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(state.entries[1]).toMatchObject({ id: 'input-queued', pending: true });
    await act(async () => { state.addPendingUserMessage(message.text, { ...options, deliveryState: 'unconfirmed' }); });
    expect(state.entries).toHaveLength(2);
    expect(state.entries[1]).toMatchObject({ deliveryState: 'unconfirmed' });
    const actual = { ...entry('actual'), text: 'repeat', timestamp: message.createdAt + 12_000 };
    await act(async () => Socket.instances[0].message({ type: 'timeline:append', entries: [actual] }));
    expect(state.entries[1]).toEqual({ ...actual, id: 'input-queued' });
    await act(async () => { state.addPendingUserMessage(message.text, options); });
    expect(state.entries).toHaveLength(2);
    expect(state.entries[1]).not.toHaveProperty('pending');
  });

  it('confirms attachment input on init without consuming another pending message', async () => {
    await act(async () => root.render(createElement(Harness)));
    const createdAt = Date.now();
    const message = { id: 'image', text: '', createdAt, attachments: [{ path: '/home/test/.purplemux/uploads/ws/tab/image.png', filename: 'image.png' }] };
    await act(async () => {
      state.addPendingUserMessage('', { autoHide: false, queueMessage: message, images: ['/api/uploads/ws/tab/image.png'] });
      state.syncInputAttempts([{ id: message.id, at: createdAt }]);
    });
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', sessionId: 'a', totalEntries: 2, startByteOffset: 0, hasMore: false, entries: [
      { ...entry('unrelated'), timestamp: createdAt + 1 },
      { ...entry('image-actual'), timestamp: createdAt + 2, text: '', images: ['/api/uploads/ws/tab/image.png'] },
    ] }));
    expect(state.entries).toHaveLength(2);
    expect(state.entries[1]).toMatchObject({ id: 'input-image' });
    expect(state.entries[1]).not.toHaveProperty('pending');
  });
  it.each([false, true])('preserves the first pending message while waiting for a new file (attachment=%s)', async (attachment) => {
    vi.useFakeTimers();
    await act(async () => root.render(createElement(Harness, { id: null })));
    let pendingId!: string;
    await act(async () => { pendingId = state.addPendingUserMessage('first message', { autoHide: false, attachmentPlaceholder: attachment }); });
    await act(async () => Socket.instances[0].message({ type: 'timeline:session-changed', newSessionId: 'b', reason: 'session-waiting' }));
    expect(state.entries).toEqual([expect.objectContaining({ id: pendingId, pending: true, attachmentPlaceholder: attachment })]);
    expect(container.textContent).toBe(pendingId);
    expect(state.isLoading).toBe(false);
    expect(state.sessionId).toBe('b');
    const confirmed = { ...entry('confirmed'), text: attachment ? 'attachment transcript' : 'first message' };
    await act(async () => Socket.instances[0].message(attachment
      ? { type: 'timeline:append', entries: [confirmed] }
      : { type: 'timeline:init', entries: [confirmed], sessionId: 'b', totalEntries: 1, startByteOffset: 0, hasMore: false }));
    expect(state.entries).toEqual([{ ...confirmed, id: pendingId }]);
  });

  it('removes confirmed records of the old session while preserving pending messages', async () => {
    saveTimelineDisplaySnapshot(key, { entries: [entry('old')], sessionId: 'a', stats: null });
    await act(async () => root.render(createElement(Harness)));
    let pendingId!: string;
    await act(async () => { pendingId = state.addPendingUserMessage('new message', { autoHide: false }); });
    await act(async () => Socket.instances[0].message({ type: 'timeline:session-changed', newSessionId: 'b', reason: 'session-waiting' }));
    expect(state.entries.map((item) => item.id)).toEqual([pendingId]);
    expect(getTimelineDisplaySnapshot(key)).toBeUndefined();
    expect(state.hasMore).toBe(false);
    expect(state.jsonlPath).toBeNull();
  });

  it('restores the latest confirmed round when returning to a tab and reconnects', async () => {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', entries: [entry('fresh')], sessionId: 'a', totalEntries: 1, startByteOffset: 0, hasMore: false }));
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(Harness)));
    expect(container.textContent).toBe('fresh');
    expect(state.isLoading).toBe(false);
    expect(Socket.instances).toHaveLength(2);
    expect(Socket.instances[0].close).toHaveBeenCalled();
  });

  it('clears the previous snapshot when starting a different session or resuming', async () => {
    saveTimelineDisplaySnapshot(key, { entries: [entry('cached')], sessionId: 'a', stats: null });
    await act(async () => root.render(createElement(Harness)));
    await act(async () => Socket.instances[0].message({ type: 'timeline:session-changed', newSessionId: 'b', reason: 'session-waiting' }));
    expect(state.entries).toEqual([]);
    expect(state.sessionId).toBe('b');
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', entries: [entry('fresh')], sessionId: 'b', totalEntries: 1, startByteOffset: 100, hasMore: true, jsonlPath: '/b.jsonl' }));
    await act(async () => Socket.instances[0].message({ type: 'timeline:resume-started', sessionId: 'c', jsonlPath: null }));
    expect(state.entries).toEqual([]);
    expect(state.jsonlPath).toBeNull();
    expect(state.hasMore).toBe(false);
    expect(state.sessionStats).toBeNull();
  });

  it('shows cached history immediately but enables pagination only after server init', async () => {
    saveTimelineDisplaySnapshot(key, { entries: [entry('cached')], sessionId: 'a', stats: null });
    await act(async () => root.render(createElement(Harness)));
    expect(container.textContent).toBe('cached');
    expect(state.isLoading).toBe(false);
    expect(state.hasMore).toBe(false);
    expect(state.jsonlPath).toBeNull();
    expect(state.agentProcess).toBeNull();
    expect(Socket.instances).toHaveLength(1);
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', entries: [entry('fresh')], sessionId: 'a', totalEntries: 1, hasMore: true, startByteOffset: 100, jsonlPath: '/a.jsonl' }));
    expect(container.textContent).toBe('fresh');
    expect(state.hasMore).toBe(true);
    await act(async () => Socket.instances[0].message({ type: 'timeline:append', entries: [entry('live')] }));
    expect(container.textContent).toBe('fresh,live');
  });

  it('accepts stats arriving in the same batch as init and rejects a different session', async () => {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => {
      Socket.instances[0].message({ type: 'timeline:init', entries: [entry('fresh')], sessionId: 'a', totalEntries: 1, startByteOffset: 0, hasMore: false });
      Socket.instances[0].message({ type: 'timeline:stats-update', sessionStats: { sessionId: 'a', inputTokens: 3 } });
      Socket.instances[0].message({ type: 'timeline:stats-update', sessionStats: { sessionId: 'b', inputTokens: 99 } });
    });
    expect(state.sessionStats?.inputTokens).toBe(3);
  });

  it('clears cached data and stale socket events when the hinted session changes', async () => {
    saveTimelineDisplaySnapshot(key, { entries: [entry('cached')], sessionId: 'a', stats: null });
    await act(async () => root.render(createElement(Harness)));
    const old = Socket.instances[0];
    await act(async () => root.render(createElement(Harness, { id: 'b' })));
    expect(container.textContent).toBe('');
    expect(state.isLoading).toBe(true);
    expect(getTimelineDisplaySnapshot(key)).toBeUndefined();
    await act(async () => old.message({ type: 'timeline:init', entries: [entry('stale')], sessionId: 'a', totalEntries: 1, startByteOffset: 0, hasMore: false }));
    expect(container.textContent).toBe('');
  });

  it('invalidates an ended session and never restores its old pagination state', async () => {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => Socket.instances[0].message({ type: 'timeline:init', entries: [entry('fresh')], sessionId: 'a', totalEntries: 1, jsonlPath: '/a.jsonl', hasMore: true, startByteOffset: 100 }));
    await act(async () => Socket.instances[0].message({ type: 'timeline:session-changed', newSessionId: '', reason: 'session-ended' }));
    expect(state.entries).toEqual([]);
    expect(state.jsonlPath).toBeNull();
    expect(state.hasMore).toBe(false);
    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(createElement(Harness)));
    expect(state.isLoading).toBe(true);
  });
});
