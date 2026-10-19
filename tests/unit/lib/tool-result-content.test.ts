// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import ToolCallItem from '@/components/features/timeline/tool-call-item';
import messages from '../../../messages/zh-CN/timeline.json';
import type { ITimelineToolCall, ITimelineToolResult } from '@/types/timeline';

const call: ITimelineToolCall = {
  id: 'call', type: 'tool-call', timestamp: 0, toolUseId: 'tool', toolName: 'exec', summary: 'exec', status: 'success',
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const renderResult = async (result: Partial<ITimelineToolResult>, entry = call) => {
  // eslint-disable-next-line react/no-children-prop -- The provider requires children in its createElement props type.
  await act(async () => root.render(createElement(NextIntlClientProvider, {
    locale: 'zh-CN', messages: { timeline: messages }, timeZone: 'UTC',
    children: createElement(ToolCallItem, {
      entry,
      result: { id: 'result', type: 'tool-result', timestamp: 0, toolUseId: 'tool', summary: '', isError: false, ...result },
    }),
  })));
};

describe('tool result rendering', () => {
  it('renders a leading Markdown link and the following heading, list and table', async () => {
    const text = '[报告](https://example.com)\n\n# 详情\n\n- 完成\n\n| 项目 | 状态 |\n| --- | --- |\n| 检查 | 通过 |';
    const output = JSON.stringify({ content: [{ type: 'text', text }] });
    await renderResult({ output });
    expect(container.querySelector('a')?.textContent).toBe('报告');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(container.querySelector('h1')?.textContent).toBe('详情');
    expect(container.querySelector('li')?.textContent).toBe('完成');
    expect(container.querySelector('table')?.textContent).toContain('通过');
    expect(container.querySelector('details pre')?.textContent).toBe(output);
  });

  it('shows command output separately and makes the exact original available on demand', async () => {
    const output = ' { "output": "  hello\\nworld\\n", "exit_code": 0, "wall_time_seconds": 0, "extra": "retained" }\n';
    await renderResult({ output });
    expect(container.textContent).toContain('退出码 0');
    expect(container.textContent).toContain('耗时 0 秒');
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(container.querySelector('pre')?.textContent).toBe('  hello\nworld\n');
    await act(async () => details.querySelector('summary')!.click());
    expect(details.open).toBe(true);
    expect(details.querySelector('pre')?.textContent).toBe(output);
    await act(async () => details.querySelector('summary')!.click());
    expect(details.open).toBe(false);
  });

  it('renders Markdown and unknown blocks together without creating HTML or media elements', async () => {
    await renderResult({ output: JSON.stringify({ content: [
      { type: 'text', text: '# Result\n\n- one\n- two\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```js\nconst n = 1;\n```\n\n<script>alert(1)</script>\n\n![hidden](https://example.com/image.png)\n\n[bad](javascript:alert(1))' },
      { type: 'image', data: 'unknown image data' },
    ] }) });
    expect(container.querySelector('h1')?.textContent).toBe('Result');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('pre code')?.textContent).toBe('const n = 1;\n');
    expect(container.querySelector('script, img, iframe')).toBeNull();
    expect(container.querySelector('a')?.getAttribute('href')).not.toMatch(/^javascript:/);
    const unknown = [...container.querySelectorAll('pre')].find((node) => node.textContent?.includes('unknown image data'))!;
    expect(unknown.closest('details')).toBeNull();
  });

  it.each(['  plain\ntext\t ', ' { "business": true }\n', '{"output":"truncated'])('keeps unsupported output byte-for-byte: %s', async (output) => {
    await renderResult({ output });
    expect(container.querySelector('pre')?.textContent).toBe(output);
    expect(container.querySelector('details')).toBeNull();
  });

  it('shows known errors, stderr, running session and empty command output', async () => {
    await renderResult({ output: JSON.stringify({ stdout: '', stderr: 'Permission denied', exit_code: 1 }) });
    expect(container.textContent).toContain('工具返回错误');
    expect(container.textContent).toContain('Permission denied');
    expect(container.textContent).toContain('退出码 1');
    await renderResult({ output: JSON.stringify({ output: '', session_id: 123 }) });
    expect(container.textContent).toContain('运行会话 123');
    expect(container.textContent).toContain('无输出');
    expect(container.textContent).not.toContain('Permission denied');
    await renderResult({ output: JSON.stringify({ content: [{ type: 'text', text: 'MCP error' }], isError: true }) });
    expect(container.textContent).toContain('工具返回错误');
  });

  it('preserves summary-only entries and existing diff visibility rules', async () => {
    await renderResult({ summary: '12 lines' });
    expect(container.querySelector('pre')?.textContent).toBe('12 lines');
    const entry = { ...call, diff: { filePath: 'file.txt', oldString: 'old', newString: 'new' } };
    await renderResult({ output: 'success output' }, entry);
    expect(container.querySelector('pre')).toBeNull();
    expect(container.textContent).toContain('显示差异');
    await renderResult({ output: 'edit failed', isError: true }, entry);
    expect(container.querySelector('pre')?.textContent).toBe('edit failed');
    expect(container.querySelector('pre')?.className).toContain('text-negative');
  });

  it('updates both readable output and expanded original when a result changes', async () => {
    await renderResult({ output: JSON.stringify({ output: 'before', exit_code: 0 }) });
    await act(async () => container.querySelector('summary')!.click());
    const updated = JSON.stringify({ output: 'after', exit_code: 1 });
    await renderResult({ output: updated });
    expect(container.querySelector('pre')?.textContent).toBe('after');
    expect(container.querySelector('details')?.open).toBe(true);
    expect(container.querySelector('details pre')?.textContent).toBe(updated);
    expect(container.textContent).not.toContain('before');
  });
});
