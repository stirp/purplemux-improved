// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WebInputBar from '@/components/features/workspace/web-input-bar';
import useNativeCommands from '@/hooks/use-native-commands';

const mocks = vi.hoisted(() => ({
  mobile: false,
  translate: (key: string) => key,
  history: { entries: [], isLoading: false, isError: false, fetchHistory: vi.fn(), addHistory: vi.fn(), deleteHistory: vi.fn() },
  queue: { messages: [] as { id: string; text: string }[], sending: false, enqueue: vi.fn(), submitNow: vi.fn(), remove: vi.fn() },
  attachments: [] as { id: string; path: string; filename: string; thumbnail: string }[],
  sendStdin: vi.fn(),
  focusTerminal: vi.fn(),
  revealTerminal: vi.fn(),
}));

vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-is-mobile-device', () => ({ default: () => mocks.mobile }));
vi.mock('@/hooks/use-message-history', () => ({ default: () => mocks.history }));
vi.mock('@/hooks/use-input-queue', () => ({ default: () => mocks.queue }));
vi.mock('@/hooks/use-web-push', () => ({ registerPushTarget: vi.fn() }));
vi.mock('@/lib/attachment-draft', () => ({ loadAttachmentDraft: () => mocks.attachments, saveAttachmentDraft: vi.fn() }));
vi.mock('@/components/features/workspace/interrupt-dialog', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/message-history-picker', () => ({ default: () => null }));

let root: Root;
let container: HTMLDivElement;
let focusInputRef: { current: (() => void) | undefined };
let setInputValueRef: { current: ((value: string) => void) | undefined };

const Harness = ({ provider = 'codex', cliState = 'idle', terminalWsConnected = true }: Partial<ComponentProps<typeof WebInputBar>>) => {
  const native = useNativeCommands({
    scopeKey: 'tab:session', provider,
    getBufferText: () => '',
    sendStdin: mocks.sendStdin,
    focusTerminal: mocks.focusTerminal,
    focusInput: () => focusInputRef.current?.(),
    revealTerminal: mocks.revealTerminal,
  });
  return createElement('div', null,
    createElement(WebInputBar, {
      tabId: 'tab', wsId: 'workspace', provider, cliState, terminalWsConnected, visible: true,
      sendStdin: mocks.sendStdin, focusTerminal: mocks.focusTerminal, focusInputRef, setInputValueRef,
      onNativeCommands: native.open, nativeCommandsActive: native.active,
    }),
    native.active && createElement('button', { onClick: native.close, 'data-return': true }, 'Return'),
  );
};

const render = async (props: Partial<ComponentProps<typeof WebInputBar>> = {}) => {
  await act(async () => root.render(createElement(Harness, props)));
};

const type = async (value: string, isComposing = false) => {
  await act(async () => {
    const input = container.querySelector('textarea')!;
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing }));
  });
};

const menuButton = () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'nativeCommandsOpen');

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  localStorage.clear();
  mocks.mobile = false;
  mocks.queue.messages = [];
  mocks.queue.sending = false;
  mocks.attachments = [];
  focusInputRef = { current: undefined };
  setInputValueRef = { current: undefined };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Web input native menus', () => {
  it.each([false, true])('hands Codex $ to the terminal without submitting, then supports manual return (mobile=%s)', async (mobile) => {
    mocks.mobile = mobile;
    await render();
    await type('$');
    expect(mocks.sendStdin.mock.calls).toEqual([['$']]);
    expect(mocks.revealTerminal).toHaveBeenCalledOnce();
    expect(mocks.focusTerminal).toHaveBeenCalledOnce();
    expect(container.querySelector('textarea')!.disabled).toBe(true);
    expect(container.querySelector('textarea')!.value).toBe('');
    expect(mocks.queue.enqueue).not.toHaveBeenCalled();
    await act(async () => (container.querySelector('[data-return]') as HTMLButtonElement).click());
    await act(async () => vi.advanceTimersByTime(500));
    expect(mocks.sendStdin.mock.calls).toEqual([['$'], ['\x05\x15']]);
    expect(container.querySelector('textarea')!.disabled).toBe(false);
    expect(document.activeElement).toBe(container.querySelector('textarea'));
    expect(mocks.focusTerminal).toHaveBeenCalledOnce();
  });

  it.each(['claude', 'codex'] as const)('preserves %s slash handoff', async (provider) => {
    await render({ provider });
    await type('/');
    expect(mocks.sendStdin.mock.calls).toEqual([['/']]);
    expect(container.querySelector('textarea')!.disabled).toBe(true);
  });

  it('offers a manual menu for a pasted skill prefix without automatically transferring focus', async () => {
    await render();
    await type('$skill');
    expect(mocks.sendStdin).not.toHaveBeenCalled();
    expect(menuButton()).toBeDefined();
    await act(async () => menuButton()!.click());
    expect(mocks.sendStdin.mock.calls).toEqual([['$skill']]);
    expect(container.querySelector('textarea')!.value).toBe('');
  });

  it.each([
    { provider: 'claude' as const, text: '$' },
    { provider: 'codex' as const, text: 'use $skill' },
    { provider: 'codex' as const, text: ' $skill' },
    { provider: 'codex' as const, text: '$skill\nnext' },
  ])('keeps $provider input $text as ordinary text', async ({ provider, text }) => {
    await render({ provider });
    await type(text);
    expect(mocks.sendStdin).not.toHaveBeenCalled();
    expect(container.querySelector('textarea')!.value).toBe(text);
    expect(menuButton()).toBeUndefined();
  });

  it('does not auto-open while composing or editing a nonempty draft', async () => {
    await render();
    await type('$', true);
    expect(mocks.sendStdin).not.toHaveBeenCalled();
    await type('$skill');
    await type('$');
    expect(mocks.sendStdin).not.toHaveBeenCalled();
    expect(container.querySelector('textarea')!.value).toBe('$');
  });

  it.each(['queued', 'sending', 'attachment', 'disconnected', 'needs-input', 'unknown', 'inactive'] as const)('preserves the draft when %s blocks native menus', async (reason) => {
    if (reason === 'queued') mocks.queue.messages = [{ id: 'pending', text: 'work' }];
    if (reason === 'sending') mocks.queue.sending = true;
    if (reason === 'attachment') mocks.attachments = [{ id: 'image', path: '/image.png', filename: 'image.png', thumbnail: '' }];
    await render({
      terminalWsConnected: reason !== 'disconnected',
      cliState: reason === 'needs-input' || reason === 'unknown' || reason === 'inactive' ? reason : 'idle',
    });
    await type('$');
    expect(mocks.sendStdin).not.toHaveBeenCalled();
    expect(container.querySelector('textarea')!.value).toBe('$');
    expect(container.querySelector('textarea')!.disabled).toBe(false);
    expect(mocks.queue.enqueue).not.toHaveBeenCalled();
  });
});
