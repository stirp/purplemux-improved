// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTimeline from '@/hooks/use-timeline';
import { clearTimelineDisplaySnapshot, getTimelineDisplaySnapshot, saveTimelineDisplaySnapshot, timelineDisplayKey } from '@/lib/timeline-display-cache';
import type { ITimelineEntry, TTimelineServerMessage } from '@/types/timeline';

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

const entry = (id: string): ITimelineEntry => ({ id, type: 'user-message', timestamp: 1, text: id });
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
