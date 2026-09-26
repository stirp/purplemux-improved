import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readJsonlTurn } from '@/lib/jsonl-turn-reader';
import { readClaudeTurn, parseIncremental } from '@/lib/session-parser';
import { CodexParser, readCodexTurn } from '@/lib/session-parser-codex';
import type { ITimelineEntry } from '@/types/timeline';

const directories: string[] = [];
const fixture = async (records: unknown[]) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-turn-'));
  directories.push(dir);
  const file = path.join(dir, 'session.jsonl');
  await fs.writeFile(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n');
  return file;
};
const codexUser = (message: string) => ({ type: 'event_msg', payload: { type: 'user_message', message } });
const codexAnswer = (message: string) => ({ type: 'event_msg', payload: { type: 'agent_message', message } });
const claudeUser = (content: unknown) => ({ type: 'user', message: { role: 'user', content } });
const claudeAnswer = (text: string) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
const messages = (entries: ITimelineEntry[]) => entries.flatMap((entry) =>
  entry.type === 'user-message' ? [entry.text] : entry.type === 'assistant-message' ? [entry.markdown] : []);

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('timeline turn pagination', () => {
  it.each([
    { provider: 'Codex', user: codexUser, answer: codexAnswer, read: readCodexTurn },
    { provider: 'Claude', user: claudeUser, answer: claudeAnswer, read: readClaudeTurn },
  ])('loads only the latest round, then each earlier round without overlap ($provider)', async ({ user, answer, read }) => {
    const file = await fixture([user('第一问😀'), answer('第一答'), user('第二问'), answer('第二答'), user('第三问'), answer('第三答')]);
    const newest = await read(file);
    expect(messages(newest.entries)).toEqual(['第三问', '第三答']);
    expect(newest.hasMore).toBe(true);
    const previous = await read(file, newest.startByteOffset);
    expect(messages(previous.entries)).toEqual(['第二问', '第二答']);
    expect(previous.startByteOffset).toBeLessThan(newest.startByteOffset);
    const first = await read(file, previous.startByteOffset);
    expect(messages(first.entries)).toEqual(['第一问😀', '第一答']);
    expect(first.startByteOffset).toBe(0);
    expect(first.hasMore).toBe(false);
  });

  it('retains the whole Codex tool sequence and live updates after initialization', async () => {
    const file = await fixture([
      codexUser('old'), codexAnswer('old answer'), codexUser('run test'),
      { type: 'event_msg', payload: { type: 'exec_command_begin', call_id: 'c1', command: 'pnpm test' } },
    ]);
    const parser = new CodexParser(file);
    const latest = await parser.parseTurn();
    expect(messages(latest.entries)).toEqual(['run test']);
    await fs.appendFile(file, JSON.stringify({ type: 'event_msg', payload: {
      type: 'exec_command_end', call_id: 'c1', exit_code: 0, stdout: 'passed',
    } }) + '\n' + JSON.stringify(codexAnswer('done')) + '\n');
    const update = await parser.parseIncremental();
    expect(update.newEntries[0]).toMatchObject({ type: 'exec-command-stream', command: 'pnpm test', stdout: 'passed', status: 'success' });
    expect(messages(update.newEntries)).toEqual(['done']);
    const older = await readCodexTurn(file, latest.startByteOffset);
    expect(messages(older.entries)).toEqual(['old', 'old answer']);
  });

  it('does not mistake Claude tool results or metadata for a new question', async () => {
    const file = await fixture([
      claudeUser('old'), claudeAnswer('old answer'), claudeUser('run test'),
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'pnpm test' } }] } },
      claudeUser([{ type: 'tool_result', tool_use_id: 't1', content: 'passed' }]),
      { ...claudeUser('hidden metadata'), isMeta: true },
      claudeAnswer('done'),
    ]);
    const page = await readClaudeTurn(file);
    expect(messages(page.entries)).toEqual(['run test', 'done']);
    expect(page.entries.find((entry) => entry.type === 'tool-call')).toMatchObject({ status: 'success', toolUseId: 't1' });
  });

  it('recognizes modern image-only Codex user messages and ignores duplicate response records', async () => {
    const file = await fixture([
      codexUser('old'), codexAnswer('old answer'),
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'duplicate' }] } },
      { type: 'event_msg', payload: { type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'image', image_url: 'image.png' }] } } },
      codexAnswer('image answer'),
    ]);
    const page = await readCodexTurn(file);
    expect(page.entries).toHaveLength(2);
    expect(page.entries[0]).toMatchObject({ type: 'user-message', text: '', images: ['image.png'] });
  });

  it.each(['Codex', 'Claude'])('rereads an unfinished UTF-8 record after initialization (%s)', async (provider) => {
    const codex = provider === 'Codex';
    const file = await fixture([codex ? codexUser('question') : claudeUser('question')]);
    const record = Buffer.from(JSON.stringify(codex ? codexAnswer('回答😀') : claudeAnswer('回答😀')) + '\n');
    const split = record.indexOf(Buffer.from('答')) + 1;
    await fs.appendFile(file, record.subarray(0, split));
    const parser = new CodexParser(file);
    const page = codex ? await parser.parseTurn() : await readClaudeTurn(file);
    expect(messages(page.entries)).toEqual(['question']);
    await fs.appendFile(file, record.subarray(split));
    const update = codex ? await parser.parseIncremental() : await parseIncremental(file, page.readOffset!);
    expect(messages(update.newEntries)).toEqual(['回答😀']);
  });

  it('preserves UTF-8 across read blocks and accepts a complete final record without a newline', async () => {
    const text = '中文😀'.repeat(15000);
    const file = await fixture([codexUser('old'), codexUser(text)]);
    await fs.appendFile(file, JSON.stringify(codexAnswer('answer')));
    const page = await readCodexTurn(file);
    expect(messages(page.entries)).toEqual([text, 'answer']);
    expect(messages((await readCodexTurn(file, page.startByteOffset)).entries)).toEqual(['old']);
  });

  it('does not read the multi-megabyte older history when the newest round fits in one block', async () => {
    const file = await fixture([codexUser('old'), codexAnswer('x'.repeat(8 * 1024 * 1024)), codexUser('new'), codexAnswer('answer')]);
    const handle = await fs.open(file, 'r');
    const read = vi.spyOn(handle, 'read');
    vi.spyOn(fs, 'open').mockResolvedValueOnce(handle);
    const page = await readJsonlTurn(file, (line) => JSON.parse(line).payload?.type === 'user_message');
    expect(page.content).toContain('new');
    expect(page.content.length).toBeLessThan(1000);
    expect(read).toHaveBeenCalledTimes(1);
    const [, , length, position] = read.mock.calls[0] as unknown as [Buffer, number, number, number];
    expect(length).toBe(64 * 1024);
    expect(position).toBeGreaterThan(8 * 1024 * 1024 - 64 * 1024);
  });

  it('handles an empty file and a cursor at the beginning', async () => {
    const file = await fixture([]);
    expect((await readCodexTurn(file)).entries).toEqual([]);
    await fs.writeFile(file, JSON.stringify(codexUser('question')) + '\n');
    const page = await readCodexTurn(file, 0);
    expect(page.entries).toEqual([]);
    expect(page.hasMore).toBe(false);
    await fs.unlink(file);
    expect((await readCodexTurn(file)).entries).toEqual([]);
  });
});
