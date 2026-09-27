import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IAgentRuntimeSnapshot } from '@/lib/providers/types';
import type { ITabStatusEntry } from '@/types/status';
import { InputQueue } from '@/lib/input-queue';
import { __testing } from '@/lib/providers/codex/runtime-snapshot';

const mocks = vi.hoisted(() => ({
  snapshot: vi.fn(),
  persist: vi.fn(async () => {}),
  watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));
vi.mock('fs', async (original) => ({ ...await original<typeof import('fs')>(), watch: mocks.watch }));
vi.mock('@/lib/providers/registry', () => ({
  getProviderByPanelType: () => ({ id: 'codex', readRuntimeSnapshot: mocks.snapshot }),
  getProvider: () => ({ id: 'codex', readRuntimeSnapshot: mocks.snapshot }),
}));
vi.mock('@/lib/providers/codex', () => ({ CODEX_PROVIDER_ID: 'codex' }));
vi.mock('@/lib/layout-store', () => ({
  setLayoutReconciler() {}, updateTabAgentState: mocks.persist, updateTabCliStatus: mocks.persist,
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug() {}, warn() {}, info() {}, error() {} }) }));
vi.mock('@/lib/codex-rate-limits-cache', () => ({ cacheCodexRateLimitsFromJsonl: async () => {} }));
vi.mock('@/lib/push-subscriptions', () => ({ getSubscriptions: async () => [], isAnyDeviceVisible: () => true }));

import { getStatusManager } from '@/lib/status-manager';

interface ITestManager {
  tabs: Map<string, ITabStatusEntry>;
  onJsonlFileChange: (id: string, file: string) => Promise<void>;
}
const manager = getStatusManager();
const internal = manager as unknown as ITestManager;
const rootPath = '/isolated/root.jsonl';
let entry: ITabStatusEntry;
const record = (at: number, payload: object) => JSON.stringify({
  timestamp: new Date(at).toISOString(), type: 'event_msg', payload,
});
const update = async (records: string[]) => {
  mocks.snapshot.mockResolvedValue(__testing.scanCodexLines(records, 0));
  await internal.onJsonlFileChange('tab', rootPath);
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(100_000);
  vi.clearAllMocks();
  entry = {
    cliState: 'idle', panelType: 'codex-cli', tmuxSession: 'tmux', workspaceId: 'ws', tabName: 'Review',
    agentProviderId: 'codex', agentSessionId: 'root', jsonlPath: rootPath,
    lastEvent: { name: 'session-start', at: 1000, seq: 1 }, eventSeq: 1,
  };
  internal.tabs.set('tab', entry);
});
afterEach(() => {
  manager.shutdown();
  internal.tabs.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('Codex review lifecycle and session ownership', () => {
  it('keeps the main binding when an activity hook belongs to another session', () => {
    expect(manager.applyAgentHookMeta('codex', 'tmux', { sessionId: 'child', jsonlPath: '/child.jsonl' }, false)).toBeNull();
    expect(entry.agentSessionId).toBe('root');
    expect(entry.jsonlPath).toBe(rootPath);
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it('allows an explicit session change and watches a root session even while idle', () => {
    manager.applyAgentHookMeta('codex', 'tmux', { sessionId: 'new-root', jsonlPath: '/new-root.jsonl' }, true);
    expect(entry.agentSessionId).toBe('new-root');
    expect(mocks.watch).toHaveBeenCalledWith('/new-root.jsonl', expect.any(Function));
  });

  it('uses main review events to block and then release queued input without child hooks', async () => {
    const deliver = vi.fn(async () => {});
    const queue = new InputQueue(() => entry, deliver);
    const records = [record(2000, { type: 'item_completed', item: { type: 'EnteredReviewMode' } })];
    await update(records);
    expect(entry.cliState).toBe('busy');
    queue.enqueue({ workspaceId: 'ws', tabId: 'tab', sessionName: 'tmux', provider: 'codex', agentSessionId: 'root' },
      { id: 'message', text: 'next task', attachments: [] });
    await queue.tick();
    expect(deliver).not.toHaveBeenCalled();

    records.push(record(3000, { type: 'task_started', turn_id: 'child-turn' }));
    records.push(record(4000, { type: 'task_complete', turn_id: 'outer-review-turn' }));
    await update(records);
    expect(entry.cliState).toBe('ready-for-review');
    expect(entry.agentSessionId).toBe('root');
    expect(entry.lastEvent?.at).toBe(4000);
    await queue.tick();
    expect(deliver).toHaveBeenCalledOnce();
    expect(queue.snapshot('tab').messages).toEqual([]);
    const seq = entry.eventSeq;
    await update(records);
    expect(entry.eventSeq).toBe(seq);
  });

  it.each(['task_complete', 'turn_aborted'])('does not end a newer task using an old %s followed by fresh token usage', async (type) => {
    entry.cliState = 'busy';
    entry.lastEvent = { name: 'prompt-submit', at: 5000, seq: 2 };
    await update([record(4000, { type }), record(6000, { type: 'token_count' })]);
    expect(entry.cliState).toBe('busy');
  });

  it('ignores an in-flight read from a replaced session', async () => {
    let resolve!: (value: IAgentRuntimeSnapshot) => void;
    mocks.snapshot.mockImplementationOnce(() => new Promise<IAgentRuntimeSnapshot>((done) => { resolve = done; }));
    const pending = internal.onJsonlFileChange('tab', rootPath);
    entry.jsonlPath = '/new-root.jsonl';
    entry.cliState = 'busy';
    resolve(__testing.scanCodexLines([record(4000, { type: 'task_complete' })], 0));
    await pending;
    expect(entry.cliState).toBe('busy');
  });
});
