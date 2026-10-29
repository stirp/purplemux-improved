import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPendingUserQuestion, ITabStatusEntry } from '@/types/status';

const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), detect: vi.fn() }));
vi.mock('@/lib/workspace-store', () => ({
  getWorkspaces: async () => ({ workspaces: [{ id: 'ws' }] }),
  synchronizeSessionWorkflow: async () => {},
}));
vi.mock('@/lib/layout-store', () => ({
  setLayoutReconciler() {}, resolveLayoutFile: () => '/isolated/layout.json',
  readLayoutFile: async () => ({ root: {} }),
  collectAllTabs: () => [{ id: 'tab', sessionName: 'tmux', name: 'Agent', panelType: 'claude-code' }],
}));
vi.mock('@/lib/process-utils', () => ({ getChildPids: async () => [] }));
vi.mock('@/lib/providers/registry', () => ({
  getProvider: () => ({
    id: 'claude', isAgentRunning: async () => true,
    readJsonlPath: () => null, readSessionId: () => null, readSummary: () => null,
    detectActiveSession: mocks.detect, readRuntimeSnapshot: mocks.snapshot,
    sessionIdFromJsonlPath: (file: string | null) => file?.split('/').pop()?.replace('.jsonl', '') ?? null,
  }),
}));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug() {}, warn() {}, info() {}, error() {} }) }));

import { getStatusManager } from '@/lib/status-manager';

const manager = getStatusManager();
const internal = manager as unknown as { tabs: Map<string, ITabStatusEntry> };
const oldQuestions = [{ id: 'old-question', question: '旧问题' }];
const newQuestions = [{ id: 'new-question', question: '新问题' }];

beforeEach(() => {
  internal.tabs.set('tab', {
    cliState: 'ready-for-review', workspaceId: 'ws', tabName: 'Agent', tmuxSession: 'tmux',
    panelType: 'claude-code', agentProviderId: 'claude', agentSessionId: 'old-session',
    jsonlPath: '/isolated/old-session.jsonl', currentProcess: 'claude',
    terminalStatus: 'idle', listeningPorts: [], pendingUserQuestions: oldQuestions,
  });
});

afterEach(() => {
  manager.shutdown();
  internal.tabs.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('pending question ownership during status polling', () => {
  it.each([
    { session: 'new-session', questions: undefined, expected: [] },
    { session: 'old-session', questions: undefined, expected: oldQuestions },
    { session: 'new-session', questions: [], expected: [] },
    { session: 'old-session', questions: [], expected: [] },
    { session: 'new-session', questions: newQuestions, expected: newQuestions },
    { session: 'old-session', questions: newQuestions, expected: newQuestions },
  ] satisfies { session: string; questions: IPendingUserQuestion[] | undefined; expected: IPendingUserQuestion[] }[])(
    'uses $expected when polling $session with questions=$questions', async ({ session, questions, expected }) => {
      mocks.detect.mockResolvedValue({ status: 'running', jsonlPath: `/isolated/${session}.jsonl` });
      mocks.snapshot.mockResolvedValue({ lastAssistantSnippet: null, currentAction: null, pendingUserQuestions: questions });
      const broadcast = vi.spyOn(manager, 'broadcast');
      await manager.poll(new Map([['tmux', { pid: 123, command: 'claude', path: '/isolated', windowActivity: 0 }]]));
      expect(manager.getAllForClient().tab).toMatchObject({ agentSessionId: session, pendingUserQuestions: expected });
      if (session !== 'old-session' || questions !== undefined) {
        expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({
          type: 'status:update', tabId: 'tab', agentSessionId: session, pendingUserQuestions: expected,
        }), undefined);
      }
    },
  );
});
