import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { ICodexHookPayload } from '@/lib/providers/codex/hook-payload';

const mocks = vi.hoisted(() => ({
  applyAgentHookMeta: vi.fn((): { tabId: string; cliState: string } | null => ({ tabId: 'tab-main', cliState: 'busy' })),
  handleProviderEvent: vi.fn(),
  emit: vi.fn(),
  verifyCliToken: vi.fn(() => true),
  isRequestAllowed: vi.fn(() => true),
}));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => mocks }));
vi.mock('@/lib/cli-token', () => ({ verifyCliToken: mocks.verifyCliToken }));
vi.mock('@/lib/access-filter', () => ({ isRequestAllowed: mocks.isRequestAllowed }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug() {}, warn() {} }) }));
vi.mock('@/lib/providers/codex/hook-events', () => ({ codexHookEvents: { emit: mocks.emit } }));

import handler from '@/pages/api/status/hook';
import { isRootCodexHook } from '@/lib/providers/codex/hook-session';

const dirs: string[] = [];
const payloadFor = async (sessionSource: unknown, event = 'PreToolUse') => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codex-hook-session-'));
  dirs.push(dir);
  const transcript = path.join(dir, 'session.jsonl');
  await fs.writeFile(transcript, JSON.stringify({ type: 'session_meta', payload: { id: 'session-1', source: sessionSource } }) + '\n');
  return { hook_event_name: event, session_id: 'session-1', transcript_path: transcript } satisfies ICodexHookPayload;
};
const request = async (payload: ICodexHookPayload) => {
  const res = { status: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis() };
  const result = await handler({ method: 'POST', query: { provider: 'codex', tmuxSession: 'main-terminal' },
    body: payload, socket: { remoteAddress: '127.0.0.1' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  expect(result).toBeUndefined();
  return res;
};

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('Codex hook session ownership', () => {
  it.each([
    { method: 'GET', query: {}, status: 405 },
    { method: 'POST', query: { provider: 'codex' }, status: 400 },
    { method: 'POST', query: {}, status: 204 },
  ])('returns void with HTTP $status', async ({ method, query, status }) => {
    const res = { status: vi.fn().mockReturnThis(), end: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
    const result = await handler({ method, query, body: { event: 'Stop', session: 'main-terminal' },
      socket: { remoteAddress: '127.0.0.1' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
    expect(result).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(status);
    if (status === 405) expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
  });

  it.each(['verifyCliToken', 'isRequestAllowed'] as const)('preserves %s rejection', async (check) => {
    mocks[check].mockReturnValueOnce(false);
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
    const result = await handler({ method: 'POST', query: {}, socket: { remoteAddress: '127.0.0.1' } } as NextApiRequest,
      res as unknown as NextApiResponse);
    expect(result).toBeUndefined();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'forbidden' });
    expect(mocks.handleProviderEvent).not.toHaveBeenCalled();
  });

  it('ignores unknown terminal sessions with a void response', async () => {
    mocks.applyAgentHookMeta.mockReturnValueOnce(null);
    const res = await request(await payloadFor('cli'));
    expect(res.status).toHaveBeenCalledWith(204);
    expect(mocks.handleProviderEvent).not.toHaveBeenCalled();
  });

  it.each(['PreToolUse', 'PostToolUse', 'UserPromptSubmit', 'SessionStart', 'Stop', 'PermissionRequest'])(
    'ignores review child %s before any metadata, state or watcher update', async (event) => {
      const res = await request(await payloadFor({ subagent: 'review' }, event));
      expect(res.status).toHaveBeenCalledWith(204);
      expect(mocks.applyAgentHookMeta).not.toHaveBeenCalled();
      expect(mocks.handleProviderEvent).not.toHaveBeenCalled();
      expect(mocks.emit).not.toHaveBeenCalled();
    },
  );

  it('allows root tool activity without allowing it to replace an existing session', async () => {
    await request(await payloadFor('cli'));
    expect(mocks.applyAgentHookMeta).toHaveBeenCalledWith('codex', 'main-terminal', expect.objectContaining({ sessionId: 'session-1' }), false);
    expect(mocks.handleProviderEvent).toHaveBeenCalledWith('codex', 'main-terminal', { kind: 'prompt-submit' });
  });

  it('allows verified root SessionStart to establish a new session', async () => {
    await request(await payloadFor('cli', 'SessionStart'));
    expect(mocks.applyAgentHookMeta).toHaveBeenCalledWith('codex', 'main-terminal', expect.objectContaining({ sessionId: 'session-1' }), true);
    expect(mocks.emit).toHaveBeenCalledWith('session-info', 'main-terminal', expect.objectContaining({ sessionId: 'session-1' }));
  });

  it('rejects missing transcripts and mismatched session IDs', async () => {
    const payload = await payloadFor('cli');
    expect(await isRootCodexHook({ ...payload, session_id: 'different' })).toBe(false);
    await fs.unlink(payload.transcript_path);
    expect(await isRootCodexHook(payload)).toBe(false);
    expect(await isRootCodexHook({})).toBe(false);
  });

  it('supports older root metadata without a source field', async () => {
    expect(await isRootCodexHook(await payloadFor(undefined))).toBe(true);
  });
});
