// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTrustPromptDetector from '@/hooks/use-trust-prompt-detector';
import TrustPromptCard from '@/components/features/workspace/trust-prompt-card';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const snapshot = (path = '/project') => `${path}\nQuick safety check\n› No, exit\n  Yes, I trust this folder`;
let buffer: string;
let root: Root;
let container: HTMLDivElement;
let detector: ReturnType<typeof useTrustPromptDetector>;
const sendStdin = vi.fn();
const Harness = ({ enabled = true, scopeKey = 'a', card = false }: { enabled?: boolean; scopeKey?: string; card?: boolean }) => {
  const current = useTrustPromptDetector({ enabled, scopeKey, getBufferText: () => buffer, sendStdin });
  useEffect(() => { detector = current; });
  if (card && current.trustPrompt) return createElement(TrustPromptCard, {
    folderPath: current.trustPrompt.folderPath,
    canRespond: current.trustPrompt.selection.mode !== 'unavailable',
    onRespond: current.onTrustResponse,
  });
  return createElement('div', null, current.trustPrompt?.folderPath ?? 'timeline');
};
const render = async (props = {}) => {
  await act(async () => root.render(createElement(Harness, props)));
};
const flush = async () => {
  await act(async () => vi.runOnlyPendingTimers());
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  sendStdin.mockReset();
  buffer = snapshot();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('startup trust prompt lifecycle', () => {
  it('separates navigation and Enter and confirms the new cursor before submitting', async () => {
    await render();
    await flush();
    expect(container.textContent).toBe('/project');
    let response!: Promise<void>;
    await act(async () => { response = detector.onTrustResponse('yes'); });
    expect(sendStdin.mock.calls).toEqual([['\x1b[B']]);
    await act(async () => vi.advanceTimersByTime(79));
    expect(sendStdin.mock.calls).toEqual([['\x1b[B']]);
    buffer = snapshot().replace('› No,', '  No,').replace('  Yes,', '› Yes,');
    await act(async () => vi.advanceTimersByTime(1));
    await act(async () => response);
    expect(sendStdin.mock.calls).toEqual([['\x1b[B'], ['\r']]);
  });

  it('keeps the card when the cursor has not moved and permits retry', async () => {
    await render();
    await flush();
    expect(container.textContent).toBe('/project');
    let response!: Promise<void>;
    await act(async () => { response = detector.onTrustResponse('yes'); });
    await flush();
    await act(async () => response);
    expect(sendStdin.mock.calls).toEqual([['\x1b[B']]);
    expect(container.textContent).toBe('/project');
    await act(async () => detector.onTrustResponse('no'));
    expect(sendStdin.mock.calls).toEqual([['\x1b[B'], ['\r']]);
  });

  it.each(['scope', 'disable', 'unmount'])('cancels pending Enter on %s', async (change) => {
    await render();
    await flush();
    expect(container.textContent).toBe('/project');
    let response!: Promise<void>;
    await act(async () => { response = detector.onTrustResponse('yes'); });
    expect(sendStdin.mock.calls).toEqual([['\x1b[B']]);
    if (change === 'scope') await render({ scopeKey: 'a:new-session' });
    if (change === 'disable') await render({ enabled: false });
    if (change === 'unmount') {
      await act(async () => root.unmount());
      root = createRoot(container);
    }
    await flush();
    await act(async () => response);
    expect(sendStdin.mock.calls).toEqual([['\x1b[B']]);
  });

  it('retains the card and allows retry when pane resizing hides the path', async () => {
    await render();
    await flush();
    expect(container.textContent).toBe('/project');
    buffer = 'Quick safety check\n› No, exit\n  Yes, I trust this folder';
    await act(async () => detector.onTrustResponse('no'));
    expect(sendStdin).not.toHaveBeenCalled();
    expect(container.textContent).toBe('/project');
    buffer = snapshot();
    await act(async () => detector.onTrustResponse('no'));
    expect(sendStdin).toHaveBeenCalledExactlyOnceWith('\r');
  });

  it('does not invent numeric keys for an unrecognized unnumbered cursor', async () => {
    buffer = snapshot().replace('›', ' ');
    await render();
    await flush();
    expect(container.textContent).toBe('/project');
    await act(async () => detector.onTrustResponse('yes'));
    expect(sendStdin).not.toHaveBeenCalled();
    expect(container.textContent).toBe('/project');
    expect(detector.trustPrompt?.selection.mode).toBe('unavailable');
    buffer = snapshot();
    detector.onTerminalData();
    await flush();
    expect(detector.trustPrompt?.selection.mode).toBe('navigation');
  });

  it('reenables the real card buttons after a failed fresh-buffer validation', async () => {
    await render({ card: true });
    await flush();
    const button = container.querySelectorAll('button')[1];
    expect(button.disabled).toBe(false);
    buffer = 'Quick safety check\n› No, exit\n  Yes, I trust this folder';
    await act(async () => button.click());
    expect(sendStdin).not.toHaveBeenCalled();
    expect(container.querySelectorAll('button')[1].disabled).toBe(false);
    buffer = snapshot();
    await act(async () => button.click());
    expect(sendStdin).toHaveBeenCalledExactlyOnceWith('\r');
  });

  it('detects an existing buffer on enable and clears the card when the prompt disappears', async () => {
    await render({ enabled: false });
    await flush();
    expect(container.textContent).toBe('timeline');
    await render();
    await flush();
    expect(container.textContent).toBe('/project');
    buffer = 'normal composer';
    detector.onTerminalData();
    await flush();
    expect(container.textContent).toBe('timeline');
  });

  it('hides the previous tab immediately and rejects its callback after switching', async () => {
    await render();
    await flush();
    const oldResponse = detector.onTrustResponse;
    detector.onTerminalData();
    buffer = snapshot('/other');
    await render({ scopeKey: 'b' });
    expect(container.textContent).toBe('timeline');
    await act(async () => oldResponse('yes'));
    expect(sendStdin).not.toHaveBeenCalled();
    await flush();
    expect(container.textContent).toBe('/other');
  });

  it('rechecks the selection before answering instead of using the earlier cursor position', async () => {
    await render();
    await flush();
    buffer = buffer.replace('› No,', '  No,').replace('  Yes,', '› Yes,');
    let response!: Promise<void>;
    await act(async () => { response = detector.onTrustResponse('no'); });
    expect(sendStdin).toHaveBeenCalledExactlyOnceWith('\x1b[A');
    buffer = snapshot();
    await flush();
    await act(async () => response);
    expect(sendStdin.mock.calls).toEqual([['\x1b[A'], ['\r']]);
    expect(container.textContent).toBe('timeline');
  });

  it('does not send input for a vanished prompt or a different folder', async () => {
    await render();
    await flush();
    buffer = snapshot('/unexpected');
    await act(async () => detector.onTrustResponse('yes'));
    expect(sendStdin).not.toHaveBeenCalled();
    buffer = snapshot();
    detector.onTerminalData();
    await flush();
    buffer = 'shell';
    await act(async () => detector.onTrustResponse('yes'));
    expect(sendStdin).not.toHaveBeenCalled();
  });

  it('cancels pending detection when disabled or unmounted', async () => {
    await render();
    await render({ enabled: false });
    await flush();
    expect(container.textContent).toBe('timeline');
    await render();
    await act(async () => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
    root = createRoot(container);
  });

  it('keeps Codex numeric selection behavior', async () => {
    buffer = 'You are in /project\nDo you trust the contents of this directory?\n› 1. Yes, continue\n  2. No, quit';
    await render();
    await flush();
    await act(async () => detector.onTrustResponse('no'));
    expect(sendStdin).toHaveBeenCalledExactlyOnceWith('2');
  });
});
