import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import fs from 'node:fs/promises';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { claudeUser, claudeToolCall, claudeToolResult, createJsonlFixture, jsonl } from '../../helpers/timeline-fixtures';
import type { ISessionStats, TTimelineServerMessage } from '@/types/timeline';

const mocks = vi.hoisted(() => ({ detect: vi.fn(), stats: vi.fn(), resumeSession: vi.fn(), providerId: 'codex' }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
vi.mock('@/lib/tmux', () => ({ getSessionPanePid: async () => 1, getPaneTitle: async () => '', checkTerminalProcess: async () => ({ isSafe: true }), sendKeys: vi.fn(), getSessionCwd: vi.fn() }));
vi.mock('@/lib/layout-store', () => ({
  updateTabAgentSessionId: async () => {}, updateTabAgentSummary: async () => {}, updateTabAgentState: async () => {}, updateTabLastUserMessage: async () => {}, parseSessionName: vi.fn(),
}));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ notifyLastUserMessage: vi.fn() }) }));
vi.mock('@/lib/providers/codex', () => ({ CODEX_PROVIDER_ID: 'codex' }));
vi.mock('@/lib/providers/codex/session-detection', () => ({ findCodexSessionById: mocks.resumeSession }));
vi.mock('@/lib/providers', () => ({ getProviderByPanelType: () => ({
  id: mocks.providerId, detectActiveSession: mocks.detect, sessionIdFromJsonlPath: () => 'a', parsePaneTitle: () => null, watchSessions: () => ({ stop: vi.fn() }),
  isValidSessionId: () => true, buildResumeCommand: async (sessionId: string) => `codex resume ${sessionId}`,
}) }));
vi.mock('@/lib/path-validation', () => ({ isCodexJsonlPath: () => mocks.providerId === 'codex', isAllowedJsonlPath: () => true }));
vi.mock('@/lib/stats/jsonl-parser-codex', () => ({ readCodexTimelineSessionStats: mocks.stats }));
vi.mock('@/lib/session-stats', () => ({ extractSessionIdFromJsonlPath: () => 'a', readSessionStats: vi.fn() }));
import { gracefulTimelineShutdown, handleTimelineConnection } from '@/lib/timeline-server';

class Client extends EventEmitter {
  readyState = WebSocket.OPEN;
  bufferedAmount = 0;
  messages: TTimelineServerMessage[] = [];
  send(data: string, callback?: (error?: Error) => void) { this.messages.push(JSON.parse(data)); callback?.(); }
  close() { this.readyState = WebSocket.CLOSED as typeof WebSocket.OPEN; this.emit('close'); }
  ping() {}
}

const fixture = createJsonlFixture();
let file: string;
let client: Client;
let resolveStats: (stats: ISessionStats) => void;
beforeEach(async () => {
  vi.clearAllMocks();
  mocks.providerId = 'codex';
  file = await fixture([
    { type: 'event_msg', payload: { type: 'user_message', message: 'hello' } },
    { type: 'event_msg', payload: { type: 'agent_message', message: 'world' } },
  ]);
  mocks.detect.mockResolvedValue({ status: 'running', sessionId: 'a', jsonlPath: file });
  mocks.stats.mockImplementation(() => new Promise<ISessionStats>((resolve) => { resolveStats = resolve; }));
  client = new Client();
});
afterEach(async () => {
  gracefulTimelineShutdown();
});

describe('timeline server initial history', () => {
  it.each([false, true])('preserves resume acknowledgement before new init when replacing a subscription (backpressure: %s)', async (backpressure) => {
    client.bufferedAmount = backpressure ? 1024 * 1024 : 0;
    await handleTimelineConnection(client as unknown as WebSocket, { url: '/api/timeline?session=pane&panelType=codex-cli' } as IncomingMessage);
    await vi.waitFor(() => expect(mocks.stats).toHaveBeenCalledTimes(1));
    client.messages.length = 0;
    const resumedFile = await fixture([
      { type: 'event_msg', payload: { type: 'user_message', message: 'resumed question' } },
      { type: 'event_msg', payload: { type: 'agent_message', message: 'resumed answer' } },
    ]);
    mocks.resumeSession.mockResolvedValue({ jsonlPath: resumedFile });
    client.emit('message', JSON.stringify({ type: 'timeline:resume', sessionId: 'resumed', tmuxSession: 'pane' }));
    await vi.waitFor(() => expect(mocks.stats).toHaveBeenCalledTimes(2));
    if (backpressure) expect(client.messages).toHaveLength(0);
    client.bufferedAmount = 0;
    await vi.waitFor(() => expect(client.messages.map((message) => message.type)).toEqual(['timeline:resume-started', 'timeline:init']));
    expect(client.messages[0]).toMatchObject({ sessionId: 'resumed', jsonlPath: resumedFile });
    expect(client.messages[1]).toMatchObject({ sessionId: 'resumed', jsonlPath: resumedFile, entries: [
      { text: 'resumed question' }, { markdown: 'resumed answer' },
    ] });
  });

  it('delivers Claude results after the watcher advanced under backpressure without another file event', async () => {
    mocks.providerId = 'claude';
    await fs.writeFile(file, jsonl([claudeUser('question')]));
    await handleTimelineConnection(client as unknown as WebSocket, { url: '/api/timeline?session=pane&panelType=claude-code' } as IncomingMessage);
    client.bufferedAmount = 1024 * 1024;
    await fs.appendFile(file, jsonl([claudeToolCall(), claudeToolResult('x'.repeat(2 * 1024 * 1024))]));
    const size = (await fs.stat(file)).size;
    const watchers = (globalThis as unknown as { __pmuxTimelineFileWatchers: Map<string, { offset: number }> }).__pmuxTimelineFileWatchers;
    await vi.waitFor(() => expect(watchers.get(file)?.offset).toBe(size));
    expect(client.messages.filter((msg) => msg.type === 'timeline:append')).toHaveLength(0);
    client.bufferedAmount = 0;
    await vi.waitFor(() => expect(client.messages.find((msg) => msg.type === 'timeline:append')).toMatchObject({ entries: [
      { type: 'tool-call', status: 'success' },
      { type: 'tool-result', output: 'x'.repeat(65536), outputFormat: 'text', outputTruncated: true },
    ] }));
    expect(client.messages.filter((msg) => msg.type === 'timeline:append')).toHaveLength(1);
  });

  it('queues init during congestion and discards queued history when switching subscriptions', async () => {
    mocks.providerId = 'claude';
    await fs.writeFile(file, jsonl([claudeUser('old'), claudeToolCall(), claudeToolResult('old body')]));
    client.bufferedAmount = 1024 * 1024;
    await handleTimelineConnection(client as unknown as WebSocket, { url: '/api/timeline?session=pane&panelType=claude-code' } as IncomingMessage);
    expect(client.messages).toHaveLength(0);
    const newFile = await fixture([claudeUser('new'), claudeToolCall(), claudeToolResult('new body')]);
    client.emit('message', JSON.stringify({ type: 'timeline:subscribe', jsonlPath: newFile }));
    client.bufferedAmount = 0;
    await vi.waitFor(() => expect(client.messages.find((msg) => msg.type === 'timeline:init')).toMatchObject({ jsonlPath: newFile, entries: [
      { text: 'new' }, { type: 'tool-call' }, { type: 'tool-result', output: 'new body' },
    ] }));
    expect(client.messages.filter((msg) => msg.type === 'timeline:init')).toHaveLength(1);
  });

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
