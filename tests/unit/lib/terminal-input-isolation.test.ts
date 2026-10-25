// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ITerminalOptions } from '@xterm/xterm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTerminal from '@/hooks/use-terminal';

const mocks = vi.hoisted(() => ({ input: vi.fn(), customKey: vi.fn(() => true), title: vi.fn(), parsed: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/multiline-url-link-provider', () => ({ createMultilineUrlLinkProvider: () => ({}) }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: class {} }));
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  options: ITerminalOptions;
  textarea = document.createElement('textarea');
  cols = 80;
  rows = 24;
  unicode = { activeVersion: '' };
  data: (value: string) => void = () => {};
  key: (event: KeyboardEvent) => boolean = () => true;
  title: (value: string) => void = () => {};
  parsed: () => void = () => {};
  focus = vi.fn(() => this.textarea.focus());
  blur = vi.fn(() => this.textarea.blur());
  scrollToBottom = vi.fn();
  write = vi.fn((_data: Uint8Array, callback: () => void) => callback());
  constructor(options: ITerminalOptions) { this.options = options; terminals.push(this); }
  loadAddon() {}
  registerLinkProvider() {}
  open(container: HTMLElement) { container.append(this.textarea); }
  onData(handler: (value: string) => void) { this.data = handler; }
  onTitleChange(handler: (value: string) => void) { this.title = handler; }
  onWriteParsed(handler: () => void) { this.parsed = handler; }
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean) { this.key = handler; }
  refresh() {}
  dispose() { this.textarea.remove(); }
} }));

interface ITerminalMock {
  options: ITerminalOptions;
  textarea: HTMLTextAreaElement;
  focus: ReturnType<typeof vi.fn>;
  blur: ReturnType<typeof vi.fn>;
  data: (value: string) => void;
  key: (event: KeyboardEvent) => boolean;
  title: (value: string) => void;
  parsed: () => void;
  write: ReturnType<typeof vi.fn>;
}
let terminal: ITerminalMock;
const terminals: ITerminalMock[] = [];
let actions: ReturnType<typeof useTerminal>;
let container: HTMLDivElement;
let root: Root;
const Harness = ({ inputEnabled }: { inputEnabled: boolean }) => {
  const value = useTerminal({ inputEnabled, onInput: mocks.input, customKeyEventHandler: mocks.customKey,
    onTitleChange: mocks.title, onWriteParsed: mocks.parsed });
  useEffect(() => { actions = value; }, [value]);
  return createElement('div', null,
    createElement('textarea', { 'aria-label': 'Web input', defaultValue: '草稿' }),
    createElement('div', { ref: value.terminalRef }),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  terminals.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('FontFace', class { async load() { return this; } });
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn(), load: async () => [] } });
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
const render = async (inputEnabled: boolean) => {
  await act(async () => root.render(createElement(Harness, { inputEnabled })));
  terminal = terminals.at(-1)!;
};

describe('terminal input isolation', () => {
  it('does not steal the Web draft on hidden reconnect or a delayed focus request', async () => {
    await render(false);
    const input = container.querySelector<HTMLTextAreaElement>('[aria-label="Web input"]')!;
    input.focus();
    actions.focus();
    setTimeout(actions.focusAtBottom, 180);
    await act(async () => vi.advanceTimersByTime(180));
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('草稿');
    expect(terminal.options.disableStdin).toBe(true);
    expect(terminal.textarea.tabIndex).toBe(-1);
    expect(terminal.focus).not.toHaveBeenCalled();
  });

  it('blurs when hidden and blocks keyboard, paste and late IME data before custom shortcuts', async () => {
    await render(true);
    actions.focus();
    expect(document.activeElement).toBe(terminal.textarea);
    await render(false);
    expect(document.activeElement).not.toBe(terminal.textarea);
    for (const data of ['确定', '\x1b[200~pasted\x1b[201~', '\r']) terminal.data(data);
    expect(terminal.key(new KeyboardEvent('keydown', { key: 'Process', isComposing: true, keyCode: 229 }))).toBe(false);
    expect(terminal.key(new KeyboardEvent('keydown', { code: 'ArrowLeft', altKey: true }))).toBe(false);
    expect(terminal.key(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }))).toBe(false);
    expect(mocks.input).not.toHaveBeenCalled();
    expect(mocks.customKey).not.toHaveBeenCalled();
  });

  it('keeps parsing output and title changes while input is disabled', async () => {
    await render(false);
    const acknowledged = vi.fn();
    actions.write(new Uint8Array([65]), acknowledged);
    await act(async () => vi.advanceTimersByTime(1));
    terminal.title('codex|/project');
    terminal.parsed();
    expect(terminal.write).toHaveBeenCalled();
    expect(acknowledged).toHaveBeenCalledWith();
    expect(mocks.title).toHaveBeenCalledWith('codex|/project');
    expect(mocks.parsed).toHaveBeenCalled();
  });

  it('restores visible terminal typing and native-menu focus without recreating xterm', async () => {
    await render(false);
    const original = terminal;
    await render(true);
    actions.focusAtBottom();
    expect(terminal).toBe(original);
    expect(terminal.options.disableStdin).toBe(false);
    expect(terminal.textarea.tabIndex).toBe(0);
    expect(document.activeElement).toBe(terminal.textarea);
    terminal.data('可见终端');
    expect(mocks.input).toHaveBeenCalledExactlyOnceWith('可见终端');
    expect(terminal.key(new KeyboardEvent('keydown', { isComposing: true, keyCode: 229 }))).toBe(true);
  });
});
