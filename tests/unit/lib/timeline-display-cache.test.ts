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
  it('evicts least recently used snapshots and retains the previous preview when nothing new fits', () => {
    for (let i = 0; i < 12; i++) saveTimelineDisplaySnapshot(`bounded-${i}`, { entries: [user(String(i))], sessionId: String(i), stats: null });
    getTimelineDisplaySnapshot('bounded-0');
    saveTimelineDisplaySnapshot('bounded-next', { entries: [user('next')], sessionId: 'next', stats: null });
    expect(getTimelineDisplaySnapshot('bounded-1')).toBeUndefined();
    expect(getTimelineDisplaySnapshot('bounded-0')).toBeDefined();
    saveTimelineDisplaySnapshot('bounded-0', { entries: [user('large', 'x'.repeat(1024 * 1024))], sessionId: '0', stats: null });
    expect(getTimelineDisplaySnapshot('bounded-0')?.entries).toEqual([user('0')]);
  });

  it('keeps tool summaries and final states for a large round without stringifying it', () => {
    const result: ITimelineEntry = { id: 'result', type: 'tool-result', timestamp: 1, toolUseId: 'tool', isError: true, summary: 'error', output: 'x'.repeat(3 * 1024 * 1024) };
    const call: ITimelineEntry = { id: 'call', type: 'tool-call', timestamp: 1, toolUseId: 'tool', toolName: 'Bash', summary: '$ test', status: 'error' };
    const stringify = vi.spyOn(JSON, 'stringify');
    try {
      saveTimelineDisplaySnapshot('large-tools', { entries: [user('q'), call, result], sessionId: 'large', stats: null });
      const snapshot = getTimelineDisplaySnapshot('large-tools');
      expect(snapshot?.entries).toEqual([user('q'), call, { ...result, output: undefined, outputFormat: 'text', outputTruncated: true }]);
      expect(JSON.stringify).not.toHaveBeenCalled();
      expect(result.output).toHaveLength(3 * 1024 * 1024);
    } finally { stringify.mockRestore(); }
  });

  it('compacts child results and keeps a bounded latest suffix for very long rounds', () => {
    const child: ITimelineEntry = { id: 'agent', type: 'agent-group', timestamp: 1, agentType: 'test', description: '', entryCount: 1, entries: [
      { id: 'r', type: 'tool-result', timestamp: 1, toolUseId: 't', isError: false, summary: 'done', output: 'x'.repeat(3 * 1024 * 1024) },
    ] };
    saveTimelineDisplaySnapshot('child', { entries: [user('q'), child], sessionId: 'child', stats: null });
    expect(getTimelineDisplaySnapshot('child')?.entries[1]).toMatchObject({ entries: [{ summary: 'done', outputTruncated: true }] });
    const entries: ITimelineEntry[] = [user('q'), ...Array.from({ length: 10000 }, (_, i): ITimelineEntry => ({ id: String(i), type: 'assistant-message', timestamp: 1, markdown: 'text'.repeat(10) }))];
    saveTimelineDisplaySnapshot('many', { entries, sessionId: 'many', stats: null });
    const cached = getTimelineDisplaySnapshot('many');
    expect(cached?.entries.length).toBeGreaterThan(0);
    expect(cached!.entries.length).toBeLessThan(entries.length);
    expect(cached?.entries.at(-1)?.id).toBe('9999');
    expect(JSON.stringify(cached).length * 2).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it('reuses object size estimates across appends', () => {
    const text = vi.fn(() => 'unchanged');
    const entry = { id: 'cached', type: 'assistant-message', timestamp: 1, get markdown() { return text(); } } as ITimelineEntry;
    saveTimelineDisplaySnapshot('reuse', { entries: [entry], sessionId: 'reuse', stats: null });
    text.mockClear();
    saveTimelineDisplaySnapshot('reuse', { entries: [entry, { ...entry, id: 'new' }], sessionId: 'reuse', stats: null });
    expect(text).toHaveBeenCalledTimes(1);
  });
});
