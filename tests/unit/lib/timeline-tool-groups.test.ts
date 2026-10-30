import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diffLines } from 'diff';
import { groupTimelineEntries } from '@/lib/timeline-tool-groups';
import type { ITimelineEntry, ITimelinePatchApply } from '@/types/timeline';

vi.mock('diff', async (original) => {
  const actual = await original<typeof import('diff')>();
  return { ...actual, diffLines: vi.fn(actual.diffLines) };
});

const patch = (): ITimelinePatchApply => ({
  id: 'patch', type: 'patch-apply', timestamp: 1, callId: 'call', status: 'success',
  files: [{ path: 'src/file.ts', status: 'update' }],
  diff: '*** Begin Patch\n*** Update File: src/file.ts\n@@\n-old\n+new\n context\n*** End Patch',
});

beforeEach(() => vi.clearAllMocks());

describe('timeline tool grouping reuse', () => {
  it('reuses groups on cached remount and patch work when another message is appended', () => {
    const entries: ITimelineEntry[] = [patch()];
    const first = groupTimelineEntries(entries);
    expect(diffLines).toHaveBeenCalledTimes(1);
    expect(groupTimelineEntries(entries)).toBe(first);
    const appended = groupTimelineEntries([...entries, { id: 'answer', type: 'assistant-message', timestamp: 2, markdown: 'done' }]);
    expect(diffLines).toHaveBeenCalledTimes(1);
    expect(appended[0]).toEqual(first[0]);
    expect(appended[1]).toMatchObject({ type: 'entry', id: 'answer' });
    expect(first[0]).toMatchObject({ type: 'tool-group', toolCalls: [{
      toolUseId: 'call:0', summary: 'Update src/file.ts (+1, -1)', status: 'success',
      diff: { oldString: 'old\ncontext', newString: 'new\ncontext', filePath: 'src/file.ts' },
    }] });
  });

  it('recomputes updated entries even with the same ID and keeps sessions isolated', () => {
    const old = patch();
    const first = groupTimelineEntries([old]);
    const changed = { ...old, status: 'error' as const, diff: old.diff!.replace('+new', '+newer\n+extra') };
    const next = groupTimelineEntries([changed]);
    expect(next[0]).toMatchObject({ toolCalls: [{ status: 'error', summary: 'Update src/file.ts (+2, -1)' }] });
    expect(first[0]).toMatchObject({ toolCalls: [{ status: 'success', summary: 'Update src/file.ts (+1, -1)' }] });
    groupTimelineEntries([patch()]);
    expect(diffLines).toHaveBeenCalledTimes(3);
  });

  it('preserves tool result pairing, group order and fallback patch behavior', () => {
    const entries: ITimelineEntry[] = [
      { id: 'call', type: 'tool-call', toolUseId: 'tool', toolName: 'Bash', summary: 'echo test', status: 'success', timestamp: 1 },
      { id: 'result', type: 'tool-result', toolUseId: 'tool', summary: 'test', isError: false, timestamp: 2 },
      { id: 'text', type: 'assistant-message', markdown: 'next', timestamp: 3 },
      { ...patch(), diff: undefined },
      { ...patch(), id: 'empty', diff: undefined, files: [] },
    ];
    expect(groupTimelineEntries(entries)).toMatchObject([
      { type: 'tool-group', id: 'call', toolCalls: [{ id: 'call' }], toolResults: [{ id: 'result' }] },
      { type: 'entry', id: 'text' },
      { type: 'tool-group', id: 'patch', toolCalls: [{ summary: 'Patch src/file.ts' }], toolResults: [] },
    ]);
    expect(diffLines).not.toHaveBeenCalled();
  });

  it('reuses work for a long tool-heavy turn after incremental updates', () => {
    const entries = Array.from({ length: 80 }, (_, i) => ({ ...patch(), id: `patch-${i}`, callId: `call-${i}` }));
    groupTimelineEntries(entries);
    expect(diffLines).toHaveBeenCalledTimes(80);
    for (let i = 0; i < 20; i++) groupTimelineEntries([...entries]);
    expect(diffLines).toHaveBeenCalledTimes(80);
  });
});
