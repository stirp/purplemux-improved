import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISessionStats, TTimelineServerMessage } from '@/types/timeline';

const mocks = vi.hoisted(() => ({ detect: vi.fn(), stats: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/tmux', () => ({ getSessionPanePid: async () => 1, getPaneTitle: async () => '', checkTerminalProcess: vi.fn(), sendKeys: vi.fn(), getSessionCwd: vi.fn() }));
vi.mock('@/lib/layout-store', () => ({
  updateTabAgentSessionId: async () => {}, updateTabAgentSummary: async () => {}, updateTabAgentState: async () => {}, updateTabLastUserMessage: async () => {}, parseSessionName: vi.fn(),
}));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ notifyLastUserMessage: vi.fn() }) }));
vi.mock('@/lib/providers/codex', () => ({ CODEX_PROVIDER_ID: 'codex' }));
vi.mock('@/lib/providers/codex/session-detection', () => ({ findCodexSessionById: vi.fn() }));
vi.mock('@/lib/providers', () => ({ getProviderByPanelType: () => ({
  id: 'codex', detectActiveSession: mocks.detect, sessionIdFromJsonlPath: () => 'a', parsePaneTitle: () => null, watchSessions: () => ({ stop: vi.fn() }),
}) }));
vi.mock('@/lib/path-validation', () => ({ isCodexJsonlPath: () => true, isAllowedJsonlPath: () => true }));
vi.mock('@/lib/stats/jsonl-parser-codex', () => ({ readCodexTimelineSessionStats: mocks.stats }));
vi.mock('@/lib/session-stats', () => ({ extractSessionIdFromJsonlPath: () => 'a', readSessionStats: vi.fn() }));
import { gracefulTimelineShutdown, handleTimelineConnection } from '@/lib/timeline-server';

class Client extends EventEmitter {
  readyState = WebSocket.OPEN;
  bufferedAmount = 0;
  messages: TTimelineServerMessage[] = [];
  send(data: string) { this.messages.push(JSON.parse(data)); }
  close() { this.emit('close'); }
  ping() {}
}

let directory: string;
let client: Client;
let resolveStats: (stats: ISessionStats) => void;
beforeEach(async () => {
  vi.clearAllMocks();
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-init-'));
  const file = path.join(directory, 'rollout-a.jsonl');
  await fs.writeFile(file, [
    { type: 'event_msg', payload: { type: 'user_message', message: 'hello' } },
    { type: 'event_msg', payload: { type: 'agent_message', message: 'world' } },
  ].map((record) => JSON.stringify(record)).join('\n') + '\n');
  mocks.detect.mockResolvedValue({ status: 'running', sessionId: 'a', jsonlPath: file });
  mocks.stats.mockImplementation(() => new Promise<ISessionStats>((resolve) => { resolveStats = resolve; }));
  client = new Client();
});
afterEach(async () => {
  gracefulTimelineShutdown();
  await fs.rm(directory, { recursive: true, force: true });
});

describe('timeline server initial history', () => {
  it('completes connection initialization with real Codex history before deferred statistics resolve', async () => {
    await handleTimelineConnection(client as unknown as WebSocket, { url: '/api/timeline?session=pane&panelType=codex-cli' } as IncomingMessage);
    const init = client.messages.find((msg) => msg.type === 'timeline:init');
    expect(init).toMatchObject({ sessionId: 'a', sessionStats: null, entries: [
      { type: 'user-message', text: 'hello' }, { type: 'assistant-message', markdown: 'world' },
    ] });
    expect(client.messages.some((msg) => msg.type === 'timeline:stats-update')).toBe(false);
    resolveStats({ sessionId: 'a', inputTokens: 3 });
    await vi.waitFor(() => expect(client.messages.at(-1)).toMatchObject({ type: 'timeline:stats-update', sessionStats: { inputTokens: 3 } }));
  });

  it('discards delayed statistics after the real connection closes', async () => {
    await handleTimelineConnection(client as unknown as WebSocket, { url: '/api/timeline?session=pane&panelType=codex-cli' } as IncomingMessage);
    client.close();
    resolveStats({ sessionId: 'a', inputTokens: 3 });
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(client.messages.some((msg) => msg.type === 'timeline:stats-update')).toBe(false);
  });
});
