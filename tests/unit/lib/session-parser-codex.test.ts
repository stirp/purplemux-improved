import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import { describe, expect, it } from 'vitest';
import { CodexParser, parseCodexContent, readCodexEntriesBefore, readTailCodexEntries } from '@/lib/session-parser-codex';
import { UPLOADS_DIR } from '@/lib/uploads-store';

const codexUserLine = (idx: number) => JSON.stringify({
  timestamp: `2026-05-02T07:37:${String(idx).padStart(2, '0')}.000Z`,
  type: 'event_msg',
  payload: {
    type: 'user_message',
    message: `message ${idx}`,
  },
});

describe('parseCodexContent', () => {
  it('renders asynchronous questions without treating acceptance as an answer', () => {
    const entries = parseCodexContent([
      { type: 'response_item', payload: { type: 'function_call', name: 'request_user_input_async', call_id: 'question-1',
        arguments: JSON.stringify({ questions: [{ title: '选择目录？', options: ['当前目录', '多个目录'] }, { title: '补充说明' }] }) } },
      { type: 'response_item', payload: { type: 'function_call_output', call_id: 'question-1', output: '{"accepted":true}' } },
    ].map((line) => JSON.stringify(line)).join('\n'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'ask-user-question', status: 'pending', answerMode: 'compose',
      questions: [{ question: '选择目录？', options: [{ label: '当前目录' }, { label: '多个目录' }] }, { question: '补充说明', options: [] }] });
  });
  it('reads completed user text and uploaded images without duplicating response records', () => {
    const imagePath = path.join(UPLOADS_DIR, 'ws-1', 'tab-1', 'image.png');
    const lines = [
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '查看结果' }] } },
      { type: 'event_msg', payload: { type: 'item_completed', item: {
        type: 'UserMessage', content: [
          { type: 'local_image', path: imagePath },
          { type: 'local_image', path: '/tmp/outside.png' },
          { type: 'text', text: '查看结果' },
        ],
      } } },
    ];
    const entries = parseCodexContent(lines.map((line) => JSON.stringify(line)).join('\n'));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'user-message', text: '查看结果', images: ['/api/uploads/ws-1/tab-1/image.png'],
    });
  });

  it('keeps image-only user messages', () => {
    const entries = parseCodexContent(JSON.stringify({ type: 'event_msg', payload: {
      type: 'item_completed', item: { type: 'UserMessage', content: [
        { type: 'local_image', path: path.join(UPLOADS_DIR, 'ws-1', 'tab-1', 'image.png') },
      ] },
    } }));
    expect(entries[0]).toMatchObject({ type: 'user-message', text: '', images: ['/api/uploads/ws-1/tab-1/image.png'] });
  });

  it('preserves a modern user, command, result and assistant sequence across incremental reads', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-modern-'));
    const jsonlPath = path.join(dir, 'session.jsonl');
    const record = (type: string, payload: unknown) => JSON.stringify({ type, payload }) + '\n';
    try {
      await fs.writeFile(jsonlPath, record('event_msg', {
        type: 'item_completed', item: { type: 'UserMessage', content: [{ type: 'text', text: '运行命令' }] },
      }) + record('response_item', { type: 'custom_tool_call', call_id: 'c1', name: 'exec', input: 'text("ok")' }));
      const parser = new CodexParser(jsonlPath);
      const initial = await parser.parseTail(20);
      expect(initial.summary).toBe('运行命令');
      expect(initial.entries.map((entry) => entry.type)).toEqual(['user-message', 'tool-call']);
      await fs.appendFile(jsonlPath,
        record('response_item', { type: 'custom_tool_call_output', call_id: 'c1', output: [{ type: 'input_text', text: 'ok\n完成' }] }) +
        record('event_msg', { type: 'item_completed', item: { type: 'AgentMessage', content: [{ type: 'Text', text: '已完成' }] } }),
      );
      const update = await parser.parseIncremental();
      expect(update.newEntries.map((entry) => entry.type)).toEqual(['tool-result', 'assistant-message']);
      expect(update.newEntries[0]).toMatchObject({ toolUseId: 'c1', summary: '2 lines', output: 'ok\n完成' });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it.each(['function_call_output', 'custom_tool_call_output'])('preserves complete string output for %s', (type) => {
    const output = 'first\n' + 'x'.repeat(500) + '\nlast';
    const entries = parseCodexContent(JSON.stringify({ type: 'response_item', payload: { type, call_id: 'c1', output } }));
    expect(entries[0]).toMatchObject({ type: 'tool-result', summary: '3 lines', output });
  });

  it('preserves free-form exec input and reads text-block output', () => {
    const input = 'const result = await tools.exec_command({cmd: "pwd\\nls -la"});\ntext(result);';
    const lines = [
      { type: 'response_item', payload: {
        type: 'custom_tool_call', call_id: 'exec-code-1', name: 'exec', input,
      } },
      { type: 'response_item', payload: {
        type: 'custom_tool_call_output', call_id: 'exec-code-1',
        output: [{ type: 'input_text', text: 'Command completed' }],
      } },
    ];
    const entries = parseCodexContent(lines.map((line) => JSON.stringify(line)).join('\n'));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      type: 'tool-call', toolName: 'exec', input, status: 'success',
      summary: expect.stringContaining('tools.exec_command'),
    });
    expect(entries[1]).toMatchObject({ type: 'tool-result', summary: 'Command completed' });
  });

  it.each(['function_call_output', 'custom_tool_call_output'])('handles mixed content in %s', (type) => {
    const entries = parseCodexContent(JSON.stringify({ type: 'response_item', payload: {
      type, call_id: 'call-1', output: [
        null, { type: 'image', data: 'ignored' },
        { type: 'input_text', text: 'first' }, { type: 'text', text: 'second' },
      ],
    } }));
    expect(entries[0]).toMatchObject({ type: 'tool-result', summary: '2 lines' });
  });

  it.each(['commentary', 'final_answer'])('reads completed AgentMessage %s without duplicating response records', (phase) => {
    const lines = [
      {
        type: 'event_msg',
        payload: {
          type: 'item_completed',
          item: {
            type: 'AgentMessage', id: 'msg-1', phase,
            content: [{ type: 'Text', text: '你好！' }, { type: 'Text', text: '\n**已完成**' }],
          },
        },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message', id: 'msg-1', role: 'assistant', phase,
          content: [{ type: 'output_text', text: '你好！\n**已完成**' }],
        },
      },
      { type: 'event_msg', payload: { type: 'task_complete', last_agent_message: '你好！\n**已完成**' } },
    ];
    const entries = parseCodexContent(lines.map((line) => JSON.stringify(line)).join('\n'));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ type: 'assistant-message', markdown: '你好！\n**已完成**' });
    expect(entries[1]).toMatchObject({ type: 'turn-end' });
  });

  it('still reads legacy agent_message events', () => {
    const entries = parseCodexContent(JSON.stringify({
      type: 'event_msg', payload: { type: 'agent_message', message: 'Legacy reply' },
    }));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: 'assistant-message', markdown: 'Legacy reply' });
  });

  it.each([
    undefined, null, 'invalid', {},
    { type: 'UserMessage', content: [{ type: 'Text', text: 'user' }] },
    { type: 'AgentMessage', content: null },
    { type: 'AgentMessage', content: [null, 'invalid', { type: 'Image' }, { type: 'Text', text: 123 }] },
  ])('ignores completed items without assistant text: %j', (item) => {
    expect(parseCodexContent(JSON.stringify({
      type: 'event_msg', payload: { type: 'item_completed', item },
    }))).toEqual([]);
  });

  it('maps Codex local_images under uploads to served image URLs', () => {
    const imagePath = path.join(UPLOADS_DIR, 'ws-1', 'tab-1', 'image.png');
    const line = {
      timestamp: '2026-05-02T07:37:12.642Z',
      type: 'event_msg',
      payload: {
        type: 'user_message',
        message: '[Image #1] describe this',
        images: [],
        local_images: [imagePath, '/tmp/outside.png'],
      },
    };

    const entries = parseCodexContent(JSON.stringify(line) + '\n');

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'user-message',
      text: '[Image #1] describe this',
      images: ['/api/uploads/ws-1/tab-1/image.png'],
    });
  });

  it('uses context_compacted event_msg and ignores top-level compacted records', () => {
    const compacted = {
      timestamp: '2026-05-02T11:34:43.788Z',
      type: 'compacted',
      payload: {
        replacement_history: [],
      },
    };
    const eventMsg = {
      timestamp: '2026-05-02T11:34:43.796Z',
      type: 'event_msg',
      payload: {
        type: 'context_compacted',
      },
    };

    const entries = parseCodexContent(`${JSON.stringify(compacted)}\n${JSON.stringify(eventMsg)}\n`);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      type: 'context-compacted',
    });
  });

  it('reads Codex tail entries with byte-offset pagination', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-tail-'));
    const jsonlPath = path.join(dir, 'session.jsonl');
    try {
      await fs.writeFile(
        jsonlPath,
        Array.from({ length: 10 }, (_, i) => codexUserLine(i + 1)).join('\n') + '\n',
        'utf-8',
      );

      const initial = await readTailCodexEntries(jsonlPath, 3);
      expect(initial.hasMore).toBe(true);
      expect(initial.startByteOffset).toBeGreaterThan(0);
      expect(initial.entries.map((entry) => entry.type === 'user-message' ? entry.text : '')).toEqual([
        'message 8',
        'message 9',
        'message 10',
      ]);

      const expanded = await readCodexEntriesBefore(jsonlPath, initial.startByteOffset, 2);
      expect(expanded.hasMore).toBe(true);
      expect(expanded.entries.map((entry) => entry.type === 'user-message' ? entry.text : '')).toEqual([
        'message 6',
        'message 7',
        'message 8',
        'message 9',
        'message 10',
      ]);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('replays warmup lines when expanding a Codex page', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-warmup-'));
    const jsonlPath = path.join(dir, 'session.jsonl');
    try {
      const lines = [
        {
          timestamp: '2026-05-02T07:38:01.000Z',
          type: 'event_msg',
          payload: { type: 'exec_command_begin', call_id: 'exec-1', command: 'pnpm test' },
        },
        {
          timestamp: '2026-05-02T07:38:02.000Z',
          type: 'event_msg',
          payload: { type: 'user_message', message: 'older 1' },
        },
        {
          timestamp: '2026-05-02T07:38:03.000Z',
          type: 'event_msg',
          payload: { type: 'user_message', message: 'older 2' },
        },
        {
          timestamp: '2026-05-02T07:38:04.000Z',
          type: 'event_msg',
          payload: { type: 'exec_command_end', call_id: 'exec-1', exit_code: 0, stdout: 'ok' },
        },
      ].map((line) => JSON.stringify(line));

      await fs.writeFile(jsonlPath, lines.join('\n') + '\n', 'utf-8');

      const initial = await readTailCodexEntries(jsonlPath, 1);
      expect(initial.entries).toHaveLength(1);
      expect(initial.entries[0]).toMatchObject({
        type: 'exec-command-stream',
        command: 'pnpm test',
      });

      const expanded = await readCodexEntriesBefore(jsonlPath, initial.startByteOffset, 1);
      expect(expanded.entries).toHaveLength(2);
      expect(expanded.entries[0]).toMatchObject({ type: 'user-message', text: 'older 2' });
      expect(expanded.entries[1]).toMatchObject({
        type: 'exec-command-stream',
        command: 'pnpm test',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('suppresses Codex write_stdin tool calls and outputs', () => {
    const call = {
      timestamp: '2026-05-02T11:40:00.000Z',
      type: 'response_item',
      payload: {
        type: 'function_call',
        call_id: 'call-1',
        name: 'write_stdin',
        arguments: JSON.stringify({ session_id: 123, chars: '', yield_time_ms: 1000 }),
      },
    };
    const output = {
      timestamp: '2026-05-02T11:40:01.000Z',
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call-1',
        output: '456',
      },
    };

    const entries = parseCodexContent(`${JSON.stringify(call)}\n${JSON.stringify(output)}\n`);

    expect(entries).toHaveLength(0);
  });

  it('preserves UTF-8 messages across tail pagination', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-utf8-'));
    const jsonlPath = path.join(dir, 'session.jsonl');
    try {
      const messages = [
        '안녕하세요 1',
        'emoji 😀 2',
        'mixed 한글 😀 3',
        '最後のメッセージ 4',
      ];
      const lines = messages.map((message, idx) => JSON.stringify({
        timestamp: `2026-05-02T07:41:0${idx}.000Z`,
        type: 'event_msg',
        payload: { type: 'user_message', message },
      }));
      await fs.writeFile(jsonlPath, lines.join('\n') + '\n', 'utf-8');

      const initial = await readTailCodexEntries(jsonlPath, 2);
      expect(initial.entries.map((entry) => entry.type === 'user-message' ? entry.text : '')).toEqual([
        'mixed 한글 😀 3',
        '最後のメッセージ 4',
      ]);

      const expanded = await readCodexEntriesBefore(jsonlPath, initial.startByteOffset, 2);
      expect(expanded.entries.map((entry) => entry.type === 'user-message' ? entry.text : '')).toEqual(messages);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps incremental partial JSONL in pendingBuffer until complete', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-incremental-'));
    const jsonlPath = path.join(dir, 'session.jsonl');
    try {
      const parser = new CodexParser(jsonlPath);
      await fs.writeFile(jsonlPath, '', 'utf-8');

      const partial = JSON.stringify({
        timestamp: '2026-05-02T07:42:00.000Z',
        type: 'event_msg',
        payload: { type: 'user_message', message: 'partial message' },
      });
      await fs.writeFile(jsonlPath, partial.slice(0, -8), 'utf-8');

      const first = await parser.parseIncremental();
      expect(first.newEntries).toHaveLength(0);
      expect(first.pendingBuffer).toBe(partial.slice(0, -8));

      await fs.writeFile(jsonlPath, partial + '\n', 'utf-8');
      const second = await parser.parseIncremental();
      expect(second.pendingBuffer).toBe('');
      expect(second.newEntries).toHaveLength(1);
      expect(second.newEntries[0]).toMatchObject({
        type: 'user-message',
        text: 'partial message',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('resets incremental state when the Codex JSONL file is truncated', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-truncate-'));
    const jsonlPath = path.join(dir, 'session.jsonl');
    try {
      const parser = new CodexParser(jsonlPath);
      await fs.writeFile(
        jsonlPath,
        [
          codexUserLine(1),
          codexUserLine(2),
        ].join('\n') + '\n',
        'utf-8',
      );

      const first = await parser.parseIncremental();
      expect(first.newEntries.map((entry) => entry.type === 'user-message' ? entry.text : '')).toEqual([
        'message 1',
        'message 2',
      ]);

      await fs.writeFile(jsonlPath, codexUserLine(9) + '\n', 'utf-8');
      const second = await parser.parseIncremental();
      expect(second.newEntries.map((entry) => entry.type === 'user-message' ? entry.text : '')).toEqual([
        'message 9',
      ]);
      expect(second.pendingBuffer).toBe('');
      expect(second.newOffset).toBe(Buffer.byteLength(codexUserLine(9) + '\n', 'utf-8'));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps completed exec entries when begin/end span a pagination boundary', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-codex-boundary-'));
    const jsonlPath = path.join(dir, 'session.jsonl');
    try {
      const lines = [
        {
          timestamp: '2026-05-02T07:43:01.000Z',
          type: 'event_msg',
          payload: { type: 'exec_command_begin', call_id: 'exec-1', command: 'pnpm test' },
        },
        ...Array.from({ length: 6 }, (_, idx) => ({
          timestamp: `2026-05-02T07:43:0${idx + 2}.000Z`,
          type: 'event_msg',
          payload: { type: 'user_message', message: `filler ${idx + 1}` },
        })),
        {
          timestamp: '2026-05-02T07:43:09.000Z',
          type: 'event_msg',
          payload: { type: 'exec_command_end', call_id: 'exec-1', exit_code: 0, stdout: 'ok' },
        },
      ].map((line) => JSON.stringify(line));

      await fs.writeFile(jsonlPath, lines.join('\n') + '\n', 'utf-8');

      const initial = await readTailCodexEntries(jsonlPath, 1);
      expect(initial.entries).toHaveLength(1);
      expect(initial.entries[0]).toMatchObject({
        type: 'exec-command-stream',
        command: 'pnpm test',
        status: 'success',
      });

      const expanded = await readCodexEntriesBefore(jsonlPath, initial.startByteOffset, 3);
      expect(expanded.entries.at(-1)).toMatchObject({
        type: 'exec-command-stream',
        command: 'pnpm test',
        status: 'success',
      });
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
