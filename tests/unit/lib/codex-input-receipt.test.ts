import { appendFile, mkdtemp, rm, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCodexInputReceipt } from '@/lib/codex-input-receipt';
import { matchesInputMessage } from '@/lib/input-message-match';
import { UPLOADS_DIR } from '@/lib/uploads-store';

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  boundPath: vi.fn(),
  status: { workspaceId: 'ws', agentProviderId: 'codex', agentSessionId: 'agent' as string | null },
}));
vi.mock('@/lib/providers/codex/session-detection', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/providers/codex/session-detection')>(), findCodexSessionById: mocks.find,
}));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => ({ tab: mocks.status }), getSessionJsonlPath: mocks.boundPath }) }));

let directory: string;
let file: string;
const target = { workspaceId: 'ws', tabId: 'tab', sessionName: 'terminal', provider: 'codex' as const, agentSessionId: 'agent' };
const message = { id: 'message', text: 'new input', attachments: [] };
const event = (timestamp: number, type: string, extra = {}) => JSON.stringify({ timestamp: new Date(timestamp).toISOString(), type: 'event_msg', payload: { type, ...extra } }) + '\n';

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'codex-receipt-'));
  file = path.join(directory, 'rollout.jsonl');
  await writeFile(file, event(1000, 'user_message', { message: 'new input' }));
  mocks.find.mockReset().mockResolvedValue({ sessionId: 'agent', jsonlPath: file });
  mocks.boundPath.mockReset().mockReturnValue(null);
  mocks.status = { workspaceId: 'ws', agentProviderId: 'codex', agentSessionId: 'agent' };
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('Codex input receipt from real incremental JSONL', () => {
  it('does not confirm a contaminated message merely because it contains the queued text', async () => {
    await appendFile(file, event(2100, 'user_message', { message: `确定${message.text}` }));
    expect(await createCodexInputReceipt(target, message, 2000)()).toEqual({ received: false, completed: false });
  });

  it('confirms a real Codex image record with a generated marker, including a new retry checker', async () => {
    const attachment = { path: path.join(UPLOADS_DIR, 'ws', 'tab', 'image.png'), filename: 'image.png' };
    const imageMessage = { ...message, text: 'describe this', attachments: [attachment] };
    const check = createCodexInputReceipt(target, imageMessage, 2000);
    expect((await check()).received).toBe(false);
    await appendFile(file, event(2100, 'user_message', { message: '[Image #1] describe this', images: [], local_images: [attachment.path] }));
    expect((await check()).received).toBe(true);
    expect((await createCodexInputReceipt(target, imageMessage, 2000)()).received).toBe(true);
  });

  it('finds a late receipt before later terminal turns when rebuilding the checker', async () => {
    await appendFile(file, event(2500, 'user_message', { message: 'new input' }) + event(2600, 'task_complete')
      + event(3000, 'user_message', { message: 'another terminal input' }));
    expect(await createCodexInputReceipt(target, message, 2000)()).toEqual({ received: true, completed: true });
  });

  it('uses a verified bound transcript created more than 30 days ago without date scanning', async () => {
    const now = Date.now();
    await writeFile(file, JSON.stringify({ type: 'session_meta', timestamp: new Date(now - 90 * 86400_000).toISOString(), payload: { id: 'agent' } }) + '\n'
      + event(now, 'user_message', { message: 'new input' }));
    mocks.find.mockResolvedValue(null);
    mocks.boundPath.mockReturnValue(file);
    expect((await createCodexInputReceipt(target, message, now - 1000)()).received).toBe(true);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it('rejects a bound file whose native session identity differs', async () => {
    await writeFile(file, JSON.stringify({ type: 'session_meta', payload: { id: 'other' } }) + '\n'
      + event(2500, 'user_message', { message: 'new input' }));
    mocks.boundPath.mockReturnValue(file);
    await expect(createCodexInputReceipt(target, message, 2000)()).rejects.toThrow('sessionChanged');
  });

  it('ignores old identical input and unrelated events, then confirms the new actual user message', async () => {
    const check = createCodexInputReceipt(target, message, 2000);
    expect(await check()).toEqual({ received: false, completed: false });
    await appendFile(file, event(2100, 'task_started') + event(2200, 'user_message', { message: 'old draft' }));
    expect(await check()).toEqual({ received: false, completed: false });
    const line = event(2300, 'item_completed', { item: { type: 'UserMessage', content: [{ type: 'text', text: 'new input' }] } });
    await appendFile(file, line.slice(0, 50));
    expect((await check()).received).toBe(false);
    await appendFile(file, line.slice(50));
    expect(await check()).toEqual({ received: true, completed: false });
    await appendFile(file, event(2400, 'task_complete'));
    expect(await check()).toEqual({ received: true, completed: true });
  });

  it('recognizes a late receipt on retry without confusing the previous identical turn', async () => {
    await appendFile(file, event(2500, 'user_message', { message: 'new input' }) + event(2600, 'task_complete'));
    expect(await createCodexInputReceipt(target, message, 2000)()).toEqual({ received: true, completed: true });
  });

  it('rejects session changes even after a parser has been initialized', async () => {
    const check = createCodexInputReceipt(target, message, 2000);
    await check();
    mocks.status.agentSessionId = 'replacement';
    await expect(check()).rejects.toThrow('sessionChanged');
  });

  it('waits for the first session binding and then rejects another identity', async () => {
    mocks.status.agentSessionId = null;
    const check = createCodexInputReceipt({ ...target, agentSessionId: null }, message, 2000);
    expect((await check()).received).toBe(false);
    mocks.status.agentSessionId = 'agent';
    await appendFile(file, event(2100, 'user_message', { message: 'new input' }));
    expect((await check()).received).toBe(true);
    mocks.status.agentSessionId = 'other';
    await expect(check()).rejects.toThrow('sessionChanged');
  });

  it('matches attachment identity as well as text rather than any next user message', () => {
    const withImage = { ...message, attachments: [{ path: '/home/test/.purplemux/uploads/ws/tab/image 1.png', filename: 'image 1.png' }] };
    const entry = { id: 'actual', type: 'user-message' as const, timestamp: 2100, text: message.text, images: ['/api/uploads/ws/tab/image%201.png'] };
    expect(matchesInputMessage(entry, withImage, 2000)).toBe(true);
    expect(matchesInputMessage({ ...entry, images: ['/api/uploads/other.png'] }, withImage, 2000)).toBe(false);
    expect(matchesInputMessage({ ...entry, text: 'different' }, withImage, 2000)).toBe(false);
  });

  it('confirms non-image files as literal paths without accepting an unrelated file', () => {
    const file = '/home/test/.purplemux/uploads/ws/tab/report 1.pdf';
    const withFile = { ...message, attachments: [{ path: file, filename: 'report 1.pdf' }] };
    const entry = { id: 'actual', type: 'user-message' as const, timestamp: 2100, text: `${file} ${message.text}` };
    expect(matchesInputMessage(entry, withFile, 2000)).toBe(true);
    expect(matchesInputMessage({ ...entry, text: entry.text.replace('report 1', 'other') }, withFile, 2000)).toBe(false);
    expect(matchesInputMessage({ ...entry, text: `${file.replace(' ', '\\ ')} ${message.text}` }, withFile, 2000)).toBe(true);
  });
});
