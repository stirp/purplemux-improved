import fs from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { parseJsonlContent, parseSessionFile, parseIncremental, readClaudeTurn } from '@/lib/session-parser';

import { claudeToolCall as toolCall, claudeToolResult as toolResult, jsonl, createJsonlFixture } from '../../helpers/timeline-fixtures';
import { MAX_CLAUDE_OUTPUT_LENGTH } from '@/lib/claude-tool-output';
import * as toolOutput from '@/lib/claude-tool-output';
const fixture = createJsonlFixture();
const parse = (content?: unknown, isError = false) => parseJsonlContent(jsonl([toolCall(), toolResult(content, isError)]));

describe('Claude complete tool results', () => {
  it('serializes 6000 levels safely in initial, history and incremental reads', async () => {
    const deep = '{"child":'.repeat(6000) + '0' + '}'.repeat(6000);
    const line = '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"tool","content":' + deep + '}]}}\n';
    const header = jsonl([{ type: 'user', message: { content: 'question' } }, toolCall()]);
    const file = await fixture(header + line);
    const check = (entries: ReturnType<typeof parseJsonlContent>) => {
      const result = entries.find((entry) => entry.type === 'tool-result');
      expect(result).toMatchObject({ outputFormat: 'json', outputTruncated: true });
      if (result?.type !== 'tool-result') throw new Error('Missing result');
      expect(result.output!.length).toBeLessThan(1000);
      expect(() => JSON.stringify(entries)).not.toThrow();
    };
    check((await parseSessionFile(file)).entries);
    const serialize = vi.spyOn(toolOutput, 'getClaudeToolOutput');
    try {
      check((await readClaudeTurn(file)).entries);
      expect(serialize).toHaveBeenCalledTimes(1);
    } finally { serialize.mockRestore(); }
    const incremental = await parseIncremental(file, Buffer.byteLength(header));
    check(incremental.newEntries);
    expect(incremental.newOffset).toBe(Buffer.byteLength(header + line));
  });

  it('omits megabyte media data and retains surrounding text and metadata', () => {
    const content = [
      { type: 'text', text: '# Before' },
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'A'.repeat(2 * 1024 * 1024) } },
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'B'.repeat(1024 * 1024) } },
      { type: 'resource', resource: { mimeType: 'application/octet-stream', blob: 'C'.repeat(1024 * 1024) } },
      { type: 'text', text: '# After' },
    ];
    const result = parse(content)[1];
    expect(result).toMatchObject({ outputFormat: 'json', outputTruncated: true });
    if (result.type !== 'tool-result') throw new Error('Missing result');
    expect(result.output!.length).toBeLessThan(1000);
    expect(JSON.parse(result.output!)).toMatchObject([
      content[0], { source: { media_type: 'image/png', data: '[omitted]' } },
      { source: { media_type: 'application/pdf', data: '[omitted]' } },
      { resource: { blob: '[omitted]' } }, content[4],
    ]);
  });

  it('bounds node count, escaped output and UTF-16 prefixes', () => {
    for (const content of [Array.from({ length: 100_000 }, () => ({ n: 1 })), { text: '\u0000'.repeat(100_000) }, { ['k'.repeat(100_000)]: true }]) {
      const result = parse(content)[1];
      expect(result).toMatchObject({ outputTruncated: true });
      if (result.type !== 'tool-result') throw new Error('Missing result');
      expect(result.output!.length).toBeLessThanOrEqual(MAX_CLAUDE_OUTPUT_LENGTH);
    }
    const text = 'x'.repeat(MAX_CLAUDE_OUTPUT_LENGTH - 1) + '😀tail';
    expect(parse(text)[1]).toMatchObject({ output: text.slice(0, MAX_CLAUDE_OUTPUT_LENGTH - 1), outputFormat: 'text', outputTruncated: true });
  });

  it('preserves multiline output and the existing command summary', () => {
    const output = '  中文😀\n\tsecond line\n';
    const entries = parse(output);
    expect(entries[0]).toMatchObject({ type: 'tool-call', status: 'success', summary: '$ echo test → 3 lines' });
    expect(entries[1]).toMatchObject({ type: 'tool-result', summary: '3 lines', output });
  });

  it('bounds long output without changing the 100-character summary', () => {
    const output = '中文'.repeat(120_000);
    expect(parse(output)[1]).toMatchObject({ summary: output.slice(0, 100), output: output.slice(0, MAX_CLAUDE_OUTPUT_LENGTH), outputFormat: 'text', outputTruncated: true });
  });

  it('keeps every content block in order, including unknown media and extra fields', () => {
    const content = [
      { type: 'text', text: '# First', annotations: { source: 'test' } },
      { type: 'image', source: { type: 'url', media_type: 'image/png', url: 'https://example.com/image.png' } },
      { type: 'text', text: 'Second\n\n- item' },
    ];
    const result = parse(content)[1];
    expect(result).toMatchObject({ summary: '# First', output: JSON.stringify(content) });
    if (result.type !== 'tool-result') throw new Error('Missing tool result');
    expect(JSON.parse(result.output!)).toEqual(content);
  });

  it.each([null, false, 0, [], { custom: { message: 'unknown' } }].map((content) => ({ content })))('preserves unknown JSON content %j', ({ content }) => {
    expect(parse(content)[1]).toMatchObject({ output: JSON.stringify(content) });
  });

  it('keeps missing and empty content compatible', () => {
    expect(parse()[1]).toMatchObject({ summary: '' });
    expect(parse()[1]).not.toHaveProperty('output');
    expect(parse('')[1]).toMatchObject({ summary: '', output: '' });
  });

  it('retains full error details and failed call status', () => {
    const output = 'Permission denied\n  file: /tmp/private\n';
    const entries = parse(output, true);
    expect(entries[0]).toMatchObject({ status: 'error' });
    expect(entries[1]).toMatchObject({ isError: true, summary: 'error', output });
  });

  it('preserves question answers, task IDs, plan state and search counts', () => {
    const questionResult = { ...toolResult('Long original response'), toolUseResult: { answers: { Choice: 'Chosen option' } } };
    const question = parseJsonlContent(jsonl([toolCall('AskUserQuestion', { questions: [{ question: 'Choice?', options: [] }] }), questionResult]));
    expect(question[0]).toMatchObject({ type: 'ask-user-question', status: 'success', answer: 'Chosen option' });
    expect(question[1]).toMatchObject({ summary: 'Chosen option', output: 'Long original response' });
    const task = parseJsonlContent(jsonl([toolCall('TaskCreate', { subject: 'Work' }), toolResult('Task #42 created successfully')]));
    expect(task[0]).toMatchObject({ type: 'task-progress', taskId: '42' });
    const plan = parseJsonlContent(jsonl([toolCall('ExitPlanMode', { plan: '# Plan' }), toolResult('Approved')]));
    expect(plan[0]).toMatchObject({ type: 'plan', status: 'success', markdown: '# Plan' });
    for (const name of ['Grep', 'Glob']) {
      const search = parseJsonlContent(jsonl([toolCall(name, { pattern: '*.ts' }), toolResult('a.ts\nb.ts')]));
      expect(search[0]).toMatchObject({ summary: expect.stringContaining('→ 2 results') });
    }
  });

  it('retains child-agent results', () => {
    const entries = parseJsonlContent(jsonl([
      { ...toolCall(), isSidechain: true },
      { ...toolResult('child\nfull output'), isSidechain: true },
    ]));
    expect(entries[0]).toMatchObject({ type: 'agent-group', entries: [
      { type: 'tool-call', status: 'success' },
      { type: 'tool-result', output: 'child\nfull output' },
    ] });
  });

  it('preserves output through initial, paginated and incremental file reads', async () => {
    const file = await fixture([
      { type: 'user', message: { content: 'old turn' } }, toolCall(), toolResult('old\nbody'),
      { type: 'user', message: { content: 'new turn' } }, toolCall(),
    ]);
    const initial = await parseSessionFile(file);
    expect(initial.entries.find((entry) => entry.type === 'tool-result')).toMatchObject({ output: 'old\nbody' });
    const newest = await readClaudeTurn(file);
    const older = await readClaudeTurn(file, newest.startByteOffset);
    expect(older.entries.find((entry) => entry.type === 'tool-result')).toMatchObject({ output: 'old\nbody' });
    const content = [{ type: 'text', text: 'new\ncomplete' }, { type: 'unknown', value: 1 }];
    await fs.appendFile(file, jsonl([toolResult(content)]));
    const update = await parseIncremental(file, newest.readOffset!);
    expect(update.newEntries).toHaveLength(1);
    expect(update.newEntries[0]).toMatchObject({ type: 'tool-result', output: JSON.stringify(content) });
    expect((await readClaudeTurn(file)).entries.find((entry) => entry.type === 'tool-result')).toMatchObject({ output: JSON.stringify(content) });
  });
});
