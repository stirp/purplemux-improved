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
  queue: { messages: [] as { id: string; text: string; attachments: { path: string; filename: string }[] }[], canceledIds: [] as string[], attempts: [] as { id: string; at: number }[], sending: false, error: null as string | null, enqueue: vi.fn(), submitNow: vi.fn(), remove: vi.fn() },
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
vi.mock('@/components/features/workspace/message-history-picker', () => ({ default: () => null }));

let root: Root;
let container: HTMLDivElement;
let focusInputRef: { current: (() => void) | undefined };
let setInputValueRef: { current: ((value: string) => void) | undefined };

const Harness = ({ provider = 'codex', cliState = 'idle', terminalWsConnected = true, ...props }: Partial<ComponentProps<typeof WebInputBar>>) => {
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
      ...props,
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
  mocks.queue.canceledIds = [];
  mocks.queue.attempts = [];
  mocks.queue.sending = false;
  mocks.queue.error = null;
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

const stopButton = () => container.querySelector<HTMLButtonElement>('[aria-label="interruptAriaLabel"]');
const sendButton = () => container.querySelector<HTMLButtonElement>('[aria-label="queueSend"]');

describe('Web input execution controls', () => {
  it.each([false, true])('explains a blocked draft without automatically retrying or canceling (mobile=%s)', async (mobile) => {
    mocks.mobile = mobile;
    mocks.queue.messages = [{ id: 'blocked', text: 'original message', attachments: [] }];
    mocks.queue.error = 'terminalHasDraft';
    const onAddPendingMessage = vi.fn();
    await render({ onAddPendingMessage });
    expect(container.textContent).toContain('queueTerminalHasDraft');
    expect(container.textContent).toContain('original message');
    expect(onAddPendingMessage).toHaveBeenCalledWith('original message', expect.objectContaining({ deliveryState: 'failed' }));
    expect(mocks.queue.submitNow).not.toHaveBeenCalled();
    expect(mocks.queue.remove).not.toHaveBeenCalled();
    expect(mocks.sendStdin).not.toHaveBeenCalled();
  });

  it.each([
    { provider: 'codex', cliState: 'busy', mobile: false },
    { provider: 'codex', cliState: 'busy', mobile: true },
    { provider: 'codex', cliState: 'needs-input', mobile: false },
    { provider: 'codex', cliState: 'needs-input', mobile: true },
    { provider: 'claude', cliState: 'busy', mobile: false },
    { provider: 'claude', cliState: 'busy', mobile: true },
    { provider: 'claude', cliState: 'needs-input', mobile: false },
    { provider: 'claude', cliState: 'needs-input', mobile: true },
  ] as const)('keeps stop after draft entry and enqueue ($provider/$cliState/mobile=$mobile)', async ({ mobile, ...props }) => {
    mocks.mobile = mobile;
    let complete!: () => void;
    mocks.queue.enqueue.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    await render(props);
    expect(stopButton()?.disabled).toBe(false);
    expect(sendButton()).toBeNull();
    await type('做 code review');
    expect(stopButton()?.className).toContain('text-ui-red');
    expect(stopButton()?.querySelector('svg')?.getAttribute('fill')).toBe('currentColor');
    expect(sendButton()?.nextElementSibling).toBe(stopButton());
    await act(async () => sendButton()!.click());
    expect(mocks.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ text: '做 code review' }));
    expect(sendButton()?.disabled).toBe(true);
    expect(stopButton()?.disabled).toBe(false);
    await act(async () => complete());
    expect(container.querySelector('textarea')!.value).toBe('');
    expect(stopButton()?.disabled).toBe(false);
    expect(sendButton()).toBeNull();
    expect(mocks.sendStdin).not.toHaveBeenCalled();
  });

  it.each([false, true])('preserves stop and an attachment-only draft after enqueue failure (mobile=%s)', async (mobile) => {
    mocks.mobile = mobile;
    mocks.attachments = [{ id: 'image', path: '/upload/image.png', filename: 'image.png', thumbnail: 'blob:image' }];
    mocks.queue.enqueue.mockRejectedValueOnce(new Error('network error'));
    await render({ cliState: 'busy' });
    expect(stopButton()?.disabled).toBe(false);
    await act(async () => sendButton()!.click());
    expect(mocks.queue.enqueue).toHaveBeenCalledWith(expect.objectContaining({ text: '', attachments: [{ path: '/upload/image.png', filename: 'image.png' }] }));
    expect(stopButton()?.disabled).toBe(false);
    expect(sendButton()?.disabled).toBe(false);
    expect(container.querySelector('img[alt="image.png"]')).not.toBeNull();
    expect(mocks.sendStdin).not.toHaveBeenCalled();
  });

  it.each([false, true])('confirms interruption independently of the draft and attachments (mobile=%s)', async (mobile) => {
    mocks.mobile = mobile;
    mocks.attachments = [{ id: 'image', path: '/upload/image.png', filename: 'image.png', thumbnail: 'blob:image' }];
    await render({ cliState: 'busy' });
    await type('keep this draft');
    await act(async () => stopButton()!.click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(mocks.sendStdin).not.toHaveBeenCalled();
    const dialogButton = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')).find((button) => button.textContent === label)!;
    await act(async () => dialogButton('cancel').click());
    expect(mocks.sendStdin).not.toHaveBeenCalled();
    await act(async () => stopButton()!.click());
    await act(async () => dialogButton('interruptConfirm').click());
    expect(mocks.sendStdin.mock.calls).toEqual([['\x1b\x1b']]);
    expect(mocks.queue.enqueue).not.toHaveBeenCalled();
    expect(container.querySelector('textarea')!.value).toBe('keep this draft');
    expect(container.querySelector('img[alt="image.png"]')).not.toBeNull();
  });

  it('disables stop while disconnected and restores it after reconnect', async () => {
    await render({ cliState: 'busy' });
    await type('draft');
    await render({ cliState: 'busy', terminalWsConnected: false });
    expect(stopButton()?.disabled).toBe(true);
    expect(sendButton()?.disabled).toBe(true);
    await act(async () => stopButton()!.click());
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(mocks.sendStdin).not.toHaveBeenCalled();
    await render({ cliState: 'busy', terminalWsConnected: true });
    expect(stopButton()?.disabled).toBe(false);
    expect(container.querySelector('textarea')!.value).toBe('draft');
  });

  it.each(['idle', 'ready-for-review', 'unknown', 'inactive', 'cancelled'] as const)('removes stop when the state changes to %s', async (cliState) => {
    await render({ cliState: 'busy' });
    await type('draft');
    expect(stopButton()).not.toBeNull();
    await render({ cliState });
    expect(stopButton()).toBeNull();
    expect(sendButton()).not.toBeNull();
    expect(container.querySelector('textarea')!.value).toBe('draft');
  });
});

describe('Web input native menus', () => {
  it.each([false, true])('retains the bubble when DELETE returns success but delivery has already started (mobile=%s)', async (mobile) => {
    mocks.mobile = mobile;
    const add = vi.fn(() => 'input-racing');
    const remove = vi.fn();
    const message = { id: 'racing', text: 'still delivering', attachments: [] };
    mocks.queue.messages = [message];
    mocks.queue.remove.mockResolvedValueOnce(undefined);
    await render({ onAddPendingMessage: add, onRemovePendingMessage: remove });
    // The UI still has the previous idle snapshot when the server refuses cancellation.
    await act(async () => (container.querySelector('[aria-label="cancelQueuedMessage"]') as HTMLButtonElement).click());
    expect(mocks.queue.remove).toHaveBeenCalledWith(message.id);
    expect(remove).not.toHaveBeenCalled();
    mocks.queue.sending = true;
    await render({ onAddPendingMessage: add, onRemovePendingMessage: remove });
    expect(add).toHaveBeenLastCalledWith(message.text, expect.objectContaining({ deliveryState: 'sending' }));
    expect(remove).not.toHaveBeenCalled();
  });

  it.each([false, true])('syncs attempts after pending messages and after rapid dequeue (mobile=%s)', async (mobile) => {
    mocks.mobile = mobile;
    const calls: string[] = [];
    const add = vi.fn(() => { calls.push('add'); return 'input-q'; });
    const sync = vi.fn(() => { calls.push('attempts'); });
    mocks.queue.messages = [{ id: 'q', text: 'message', attachments: [] }];
    await render({ onAddPendingMessage: add, onSyncInputAttempts: sync });
    expect(calls).toEqual(['add', 'attempts']);
    mocks.queue.messages = [];
    mocks.queue.attempts = [{ id: 'q', at: 2000 }];
    await render({ onAddPendingMessage: add, onSyncInputAttempts: sync });
    expect(sync).toHaveBeenLastCalledWith([{ id: 'q', at: 2000 }]);
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('removes remote cancellations but keeps successfully dequeued placeholders awaiting a transcript', async () => {
    const add = vi.fn();
    const remove = vi.fn();
    mocks.queue.messages = [{ id: 'remote', text: 'queued elsewhere', attachments: [] }, { id: 'sent', text: 'sent', attachments: [] }];
    await render({ onAddPendingMessage: add, onRemovePendingMessage: remove });
    expect(add).toHaveBeenCalledTimes(2);
    mocks.queue.messages = [];
    mocks.queue.canceledIds = ['remote'];
    await render({ onAddPendingMessage: add, onRemovePendingMessage: remove });
    expect(remove).toHaveBeenCalledWith('input-remote');
    expect(remove).not.toHaveBeenCalledWith('input-sent');
    expect(mocks.queue.remove).not.toHaveBeenCalled();
  });

  it.each([false, true])('shows pending input before enqueue finishes and retains a draft on failure (mobile=%s)', async (mobile) => {
    mocks.mobile = mobile;
    let reject!: (error: Error) => void;
    mocks.queue.enqueue.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail; }));
    const add = vi.fn(() => 'pending-id');
    const remove = vi.fn();
    await render({ onAddPendingMessage: add, onRemovePendingMessage: remove });
    await type('new message');
    await act(async () => (container.querySelector('[aria-label="queueSend"]') as HTMLButtonElement).click());
    expect(add).toHaveBeenCalledWith('new message', expect.objectContaining({ autoHide: false, deliveryState: 'sending' }));
    expect(mocks.queue.enqueue).toHaveBeenCalledTimes(1);
    expect(container.querySelector('textarea')!.value).toBe('new message');
    await act(async () => reject(new Error('network error')));
    expect(remove).toHaveBeenCalledWith('pending-id');
    expect(container.querySelector('textarea')!.value).toBe('new message');
  });

  it('clears the submitted draft on enqueue success and removes its pending bubble when canceled', async () => {
    mocks.queue.enqueue.mockResolvedValueOnce(undefined);
    mocks.queue.remove.mockResolvedValueOnce(undefined);
    const add = vi.fn(() => 'input-id');
    const remove = vi.fn();
    await render({ onAddPendingMessage: add, onRemovePendingMessage: remove });
    await type('new message');
    await act(async () => (container.querySelector('[aria-label="queueSend"]') as HTMLButtonElement).click());
    const message = mocks.queue.enqueue.mock.calls[0][0];
    expect(container.querySelector('textarea')!.value).toBe('');
    mocks.queue.messages = [message];
    await render({ onAddPendingMessage: add, onRemovePendingMessage: remove });
    expect(add).toHaveBeenLastCalledWith('new message', expect.objectContaining({ deliveryState: 'queued', queueMessage: message }));
    await act(async () => (container.querySelector('[aria-label="cancelQueuedMessage"]') as HTMLButtonElement).click());
    expect(remove).not.toHaveBeenCalled();
    mocks.queue.messages = [];
    mocks.queue.canceledIds = [message.id];
    await render({ onAddPendingMessage: add, onRemovePendingMessage: remove });
    expect(remove).toHaveBeenCalledWith(`input-${message.id}`);
  });
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
    if (reason === 'queued') mocks.queue.messages = [{ id: 'pending', text: 'work', attachments: [] }];
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
