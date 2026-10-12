import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTimelineDisplaySnapshot, saveTimelineDisplaySnapshot, timelineDisplayKey } from '@/lib/timeline-display-cache';
import type { ITimelineEntry } from '@/types/timeline';

const user = (id: string, text = id, pending = false): ITimelineEntry => ({ id, type: 'user-message', timestamp: 1, text, pending });
afterEach(() => vi.useRealTimers());

describe('timeline display cache', () => {
  it('isolates provider, pane and agent session and refuses unknown identities', () => {
    const key = timelineDisplayKey('codex-cli', 'pane-a', 'a');
    saveTimelineDisplaySnapshot(key, { entries: [user('a')], sessionId: 'a', stats: null });
    expect(getTimelineDisplaySnapshot(key)?.entries).toEqual([user('a')]);
    expect(getTimelineDisplaySnapshot(timelineDisplayKey('claude-code', 'pane-a', 'a'))).toBeUndefined();
    expect(getTimelineDisplaySnapshot(timelineDisplayKey('codex-cli', 'pane-b', 'a'))).toBeUndefined();
    expect(getTimelineDisplaySnapshot(timelineDisplayKey('codex-cli', 'pane-a', 'b'))).toBeUndefined();
    expect(timelineDisplayKey('codex-cli', 'pane-a', null)).toBeNull();
  });
  it('retains only the latest confirmed round and expires after five minutes', () => {
    vi.useFakeTimers();
    const key = 'expiry';
    saveTimelineDisplaySnapshot(key, { entries: [user('old'), user('latest'), user('pending', 'pending', true)], sessionId: 'expiry', stats: null });
    expect(getTimelineDisplaySnapshot(key)?.entries.map((entry) => entry.id)).toEqual(['latest']);
    vi.advanceTimersByTime(300_000);
    expect(getTimelineDisplaySnapshot(key)).toBeUndefined();
  });
  it('evicts least recently used snapshots and refuses oversized records', () => {
    for (let i = 0; i < 12; i++) saveTimelineDisplaySnapshot(`bounded-${i}`, { entries: [user(String(i))], sessionId: String(i), stats: null });
    getTimelineDisplaySnapshot('bounded-0');
    saveTimelineDisplaySnapshot('bounded-next', { entries: [user('next')], sessionId: 'next', stats: null });
    expect(getTimelineDisplaySnapshot('bounded-1')).toBeUndefined();
    expect(getTimelineDisplaySnapshot('bounded-0')).toBeDefined();
    saveTimelineDisplaySnapshot('bounded-0', { entries: [user('large', 'x'.repeat(1024 * 1024))], sessionId: '0', stats: null });
    expect(getTimelineDisplaySnapshot('bounded-0')).toBeUndefined();
  });
});
