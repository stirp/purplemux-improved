import { describe, expect, it } from 'vitest';
import { getToolResultPresentation } from '@/lib/tool-result-presentation';

const present = (value: unknown) => getToolResultPresentation(JSON.stringify(value));

describe('tool result presentation', () => {
  it('extracts command text and zero-valued metadata without altering whitespace', () => {
    expect(present({ output: '  hello\n\tworld\n', exit_code: 0, wall_time_seconds: 0, chunk_id: 'abc' })).toEqual({
      blocks: [{ kind: 'command', output: '  hello\n\tworld\n', exitCode: 0, duration: 0 }],
      isError: false,
    });
  });

  it('preserves stderr, failed exits, empty output and running session IDs', () => {
    expect(present({ stdout: '', stderr: 'denied\n', exit_code: 2 })).toMatchObject({
      blocks: [{ kind: 'command', output: '', stderr: 'denied\n', exitCode: 2 }], isError: true,
    });
    expect(present({ output: '', session_id: 0, exit_code: null })).toMatchObject({
      blocks: [{ output: '', sessionId: 0 }], isError: false,
    });
  });

  it('unwraps nested MCP and fulfilled command results and preserves unknown blocks', () => {
    const unknown = { type: 'resource', resource: { uri: 'file:///tmp/a', text: 'resource body' } };
    expect(present({ content: [
      { type: 'text', text: '# Results\n\n- found' },
      { type: 'text', text: JSON.stringify({ status: 'fulfilled', value: { output: 'command body', exit_code: 1 } }) },
      unknown,
    ] })).toMatchObject({
      blocks: [
        { kind: 'markdown', text: '# Results\n\n- found' },
        { kind: 'command', output: 'command body', exitCode: 1 },
        { kind: 'raw', text: JSON.stringify(unknown, null, 2) },
      ],
      isError: true,
    });
  });

  it('supports content arrays, input_text and MCP errors', () => {
    expect(present([{ type: 'input_text', text: 'hello' }])?.blocks).toEqual([{ kind: 'markdown', text: 'hello' }]);
    expect(present({ content: [{ type: 'text', text: 'Failed' }], isError: true })?.isError).toBe(true);
  });

  it('does not reinterpret unknown JSON embedded in a text block as Markdown', () => {
    const json = ' { "list": [1, 2] }\n';
    expect(present({ content: [{ type: 'text', text: json }] })?.blocks).toEqual([{ kind: 'raw', text: json }]);
  });

  it.each([
    '[报告](https://example.com)\n\n# 详情\n\n- 完成',
    ' \n[123](https://example.com)',
    '[报告][ref]\n\n[ref]: https://example.com',
    '[ref]: https://example.com\n\n[报告][ref]',
    '[报告 [详情]](https://example.com)',
    '[报告\\]详情](https://example.com)',
    '[报告\n详情](https://example.com)',
  ])('renders a leading Markdown link as Markdown: %s', (text) => {
    expect(present({ content: [{ type: 'text', text }] })?.blocks).toEqual([{ kind: 'markdown', text }]);
  });

  it.each([
    '[1, 2]', ' ["[报告](https://example.com)"]\n',
    '[{"message":"[报告](https://example.com)"}]',
    '[1,', '[{"unfinished":', '{"unfinished":', '[broken]', '["[报告](https://example.com)"',
  ])('keeps unknown or malformed JSON inside text blocks raw: %s', (text) => {
    expect(present({ content: [{ type: 'text', text }] })?.blocks).toEqual([{ kind: 'raw', text }]);
  });

  it.each([
    '', 'normal\ntext', ' { "unknown": 1 }\n', '{"output":"unfinished', 'null', '[]',
    '[{"type":"image","data":"abc"}]', '{"content":[{"type":"text","text":42}]}',
    '{"output":"business data"}', '{"output":42,"exit_code":0}',
    '{"output":"ok","exit_code":"0"}', '{"output":"ok","exit_code":0.5}',
    '{"output":"ok","wall_time_seconds":-1}', '{"output":"ok","session_id":{}}',
    '{"output":"ok","stdout":"different","exit_code":0}',
    '{"status":"fulfilled","value":{"unknown":true}}',
  ])('leaves unknown or malformed output unchanged: %s', (raw) => {
    expect(getToolResultPresentation(raw)).toBeNull();
  });

  it('bounds parsing depth and length without dropping the original payload', () => {
    let value: unknown = { output: 'deep', exit_code: 0 };
    for (let depth = 0; depth < 8; depth++) value = { status: 'fulfilled', value };
    expect(present(value)).toBeNull();
    expect(present({ output: 'a'.repeat(200_001), exit_code: 0 })).toBeNull();
  });
});
