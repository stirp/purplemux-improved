// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import AssistantMessageItem from '@/components/features/timeline/assistant-message-item';
import PlanItem from '@/components/features/timeline/plan-item';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

let container: HTMLDivElement;
let root: Root;
let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('isSecureContext', true);
  writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const renderMessage = async (markdown: string) => {
  await act(async () => root.render(createElement(AssistantMessageItem, {
    entry: { id: 'message', type: 'assistant-message', timestamp: 0, markdown },
  })));
};

const copyButtons = () => [...container.querySelectorAll<HTMLButtonElement>('button[aria-label="copyCode"]')];

describe('AI Markdown code copying', () => {
  it('copies each block as plain text, preserving highlighted content and whitespace without inline-code buttons', async () => {
    const code = 'const text = "<&中文>";\n\n\tconsole.log(text);  \n';
    await renderMessage('Inline `code`\n\n```js\n' + code + '```\n\n```\nplain\n```\n\n    indented\n');
    expect(copyButtons()).toHaveLength(3);
    expect(container.querySelector('pre code .hljs-keyword')).not.toBeNull();
    expect(container.querySelector('p button')).toBeNull();
    expect(container.querySelector('pre button')).toBeNull();
    expect(container.querySelector('pre')?.hasAttribute('node')).toBe(false);
    await act(async () => copyButtons()[0].click());
    expect(writeText).toHaveBeenLastCalledWith(code);
    expect(copyButtons()[0].textContent).toBe('codeCopied');
    expect(copyButtons()[1].textContent).toBe('copyCode');
    await act(async () => copyButtons()[1].click());
    expect(writeText).toHaveBeenLastCalledWith('plain\n');
    await act(async () => copyButtons()[2].click());
    expect(writeText).toHaveBeenLastCalledWith('indented\n');
  });

  it('restores the copy label after two seconds and clears timers when unmounted', async () => {
    vi.useFakeTimers();
    await renderMessage('```\ntext\n```');
    await act(async () => copyButtons()[0].click());
    expect(copyButtons()[0].textContent).toBe('codeCopied');
    await act(async () => vi.advanceTimersByTime(2000));
    expect(copyButtons()[0].textContent).toBe('copyCode');
    await act(async () => copyButtons()[0].click());
    await renderMessage('No code');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts feedback for two seconds after a repeat copy near expiry', async () => {
    vi.useFakeTimers();
    await renderMessage('```\ntext\n```');
    await act(async () => copyButtons()[0].click());
    await act(async () => vi.advanceTimersByTime(1900));
    await act(async () => copyButtons()[0].click());
    expect(writeText).toHaveBeenCalledTimes(2);
    await act(async () => vi.advanceTimersByTime(100));
    expect(copyButtons()[0].textContent).toBe('codeCopied');
    await act(async () => vi.advanceTimersByTime(1899));
    expect(copyButtons()[0].textContent).toBe('codeCopied');
    await act(async () => vi.advanceTimersByTime(1));
    expect(copyButtons()[0].textContent).toBe('copyCode');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears pending feedback when a repeat copy fails and allows retry', async () => {
    vi.useFakeTimers();
    await renderMessage('```\nretry\n```');
    await act(async () => copyButtons()[0].click());
    await act(async () => vi.advanceTimersByTime(1900));
    writeText.mockRejectedValueOnce(new Error('Permission denied'));
    await act(async () => copyButtons()[0].click());
    expect(toast.error).toHaveBeenCalledWith('codeCopyFailed');
    expect(copyButtons()[0].textContent).toBe('copyCode');
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => copyButtons()[0].click());
    await act(async () => vi.advanceTimersByTime(1999));
    expect(copyButtons()[0].textContent).toBe('codeCopied');
    await act(async () => vi.advanceTimersByTime(1));
    expect(copyButtons()[0].textContent).toBe('copyCode');
  });

  it('reports denied clipboard access and allows retry', async () => {
    writeText.mockRejectedValueOnce(new Error('Permission denied'));
    await renderMessage('```\nretry\n```');
    await act(async () => copyButtons()[0].click());
    expect(toast.error).toHaveBeenCalledWith('codeCopyFailed');
    expect(copyButtons()[0].textContent).toBe('copyCode');
    await act(async () => copyButtons()[0].click());
    expect(copyButtons()[0].textContent).toBe('codeCopied');
  });

  it('copies the latest rendered message content', async () => {
    await renderMessage('```\ninitial');
    await act(async () => copyButtons()[0].click());
    expect(writeText).toHaveBeenLastCalledWith('initial\n');
    await renderMessage('```\ninitial\nupdated\n```');
    await act(async () => copyButtons()[0].click());
    expect(writeText).toHaveBeenLastCalledWith('initial\nupdated\n');
  });

  it('uses the existing HTTP clipboard fallback and handles its failure', async () => {
    vi.stubGlobal('isSecureContext', false);
    const execCommand = vi.fn(() => {
      expect(document.querySelector('textarea')?.value).toBe('fallback\n');
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    try {
      await renderMessage('```\nfallback\n```');
      await act(async () => copyButtons()[0].click());
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(writeText).not.toHaveBeenCalled();
      expect(document.querySelector('textarea')).toBeNull();
      execCommand.mockReturnValue(false);
      await act(async () => copyButtons()[0].click());
      expect(toast.error).toHaveBeenCalledWith('codeCopyFailed');
      expect(copyButtons()[0].textContent).toBe('copyCode');
    } finally {
      Reflect.deleteProperty(document, 'execCommand');
    }
  });

  it('offers the same code copying inside plan details', async () => {
    await act(async () => root.render(createElement(PlanItem, {
      entry: { id: 'plan', toolUseId: 'plan-tool', type: 'plan', timestamp: 0, markdown: '# Plan\n\n```sh\necho plan\n```', status: 'success' },
    })));
    await act(async () => container.querySelector('button')!.click());
    const button = document.querySelector<HTMLButtonElement>('[role="dialog"] button[aria-label="copyCode"]')!;
    expect(button).not.toBeNull();
    await act(async () => button.click());
    expect(writeText).toHaveBeenCalledWith('echo plan\n');
  });
});
