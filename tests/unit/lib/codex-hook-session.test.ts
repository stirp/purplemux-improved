import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { ICodexHookPayload } from '@/lib/providers/codex/hook-payload';

const mocks = vi.hoisted(() => ({
  applyAgentHookMeta: vi.fn(() => ({ tabId: 'tab-main', cliState: 'busy' })),
  handleProviderEvent: vi.fn(),
  emit: vi.fn(),
}));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => mocks }));
vi.mock('@/lib/cli-token', () => ({ verifyCliToken: () => true }));
vi.mock('@/lib/access-filter', () => ({ isRequestAllowed: () => true }));
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
  const res = { status: vi.fn().mockReturnThis(), end: vi.fn() };
  await handler({ method: 'POST', query: { provider: 'codex', tmuxSession: 'main-terminal' },
    body: payload, socket: { remoteAddress: '127.0.0.1' } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('Codex hook session ownership', () => {
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
