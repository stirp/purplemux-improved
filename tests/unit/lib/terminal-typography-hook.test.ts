// @vitest-environment jsdom
import { act, createElement, useCallback, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ITerminalOptions } from '@xterm/xterm';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import useTerminal from '@/hooks/use-terminal';
import useConfigStore from '@/hooks/use-config-store';
import { resolveTerminalTypography } from '@/lib/terminal-appearance';
import { getTerminalTheme } from '@/lib/terminal-themes';
import { hasNativeCodexTrustPrompt } from '@/lib/trust-prompt-detector';

const mocks = vi.hoisted(() => ({
  bufferLines: [] as { isWrapped: boolean; translateToString: ReturnType<typeof vi.fn> }[],
  terminals: [] as { options: ITerminalOptions; cols: number; rows: number; resize: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
  fit: vi.fn(),
  proposeDimensions: vi.fn(() => ({ cols: 80, rows: 12 })),
  onContainerResize: undefined as (() => void) | undefined,
  translate: (key: string) => key,
}));
vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('@/lib/multiline-url-link-provider', () => ({ createMultilineUrlLinkProvider: () => ({}) }));
vi.mock('@xterm/xterm', async (importOriginal) => {
  const { Terminal: BufferTerminal } = await importOriginal<typeof import('@xterm/xterm')>();
  return { Terminal: class {
    options: ITerminalOptions;
    cols = 80;
    rows = 24;
    engine = new BufferTerminal({ cols: 80, rows: 24, allowProposedApi: true });
    resize = vi.fn((cols: number, rows: number) => {
      this.cols = cols;
      this.rows = rows;
      this.engine.resize(cols, rows);
    });
    get buffer() {
      return mocks.bufferLines.length ? { active: {
        length: mocks.bufferLines.length,
        getLine: (index: number) => mocks.bufferLines[index],
      } } : this.engine.buffer;
    }
    write(data: Uint8Array, callback?: () => void) { this.engine.write(data, callback); }
    unicode = { activeVersion: '' };
    refresh = vi.fn();
    dispose = vi.fn(() => this.engine.dispose());
    constructor(options: ITerminalOptions) { this.options = options; mocks.terminals.push(this); }
    loadAddon() {}
    registerLinkProvider() {}
    open() {}
    onData() {}
    onTitleChange() {}
    onWriteParsed() {}
    attachCustomKeyEventHandler() {}
  } };
});
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = mocks.fit; proposeDimensions = mocks.proposeDimensions; } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: class {} }));

let root: Root;
let container: HTMLDivElement;
let fontLoad: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.terminals.length = 0;
  mocks.bufferLines.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { mocks.onContainerResize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal('FontFace', class { async load() { return this; } });
  fontLoad = vi.fn(async () => []);
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn(), load: fontLoad } });
  useConfigStore.getState().hydrate({});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const theme = getTerminalTheme('snazzy').colors;
const Harness = ({ newThemeObject = false, foreground }: { newThemeObject?: boolean; foreground?: string }) => {
  const { terminalRef } = useTerminal(resolveTerminalTypography({ theme: newThemeObject ? { ...theme } : theme }, foreground ? { color: foreground } : undefined));
  return createElement('div', { ref: terminalRef });
};

describe('terminal typography hook', () => {
  it('keeps the local buffer and PTY size equal across collapsed fits, fonts, resize and expansion', async () => {
    const onResize = vi.fn();
    let actions!: ReturnType<typeof useTerminal>;
    const SizeHarness = ({ collapsed = true, fontSize = 12 }) => {
      const normalizeSize = useCallback((cols: number, rows: number) => ({ cols, rows: collapsed ? Math.max(rows, 40) : rows }), [collapsed]);
      const current = useTerminal({ theme, fontSize, normalizeSize, onResize, inputEnabled: !collapsed });
      useEffect(() => { actions = current; });
      return createElement('div', { ref: current.terminalRef });
    };
    await act(async () => root.render(createElement(SizeHarness)));
    const terminal = mocks.terminals.at(-1)!;
    expect(terminal.options.disableStdin).toBe(true);
    expect(terminal.rows).toBe(40);
    expect(onResize).toHaveBeenLastCalledWith(80, 40);
    expect(mocks.fit).not.toHaveBeenCalled();
    const output = '\x1b[2J\x1b[1;1HFolder access\x1b[4;1HTrust this folder?\x1b[30;1H› 1. Trust and continue\x1b[31;1H  2. Quit';
    await act(async () => new Promise<void>((resolve, reject) => {
      actions.write(new TextEncoder().encode(output), (error) => error ? reject(error) : resolve());
    }));
    expect(hasNativeCodexTrustPrompt(actions.getBufferText())).toBe(true);
    expect(actions.fit()).toEqual({ cols: 80, rows: 40 });

    await act(async () => root.render(createElement(SizeHarness, { fontSize: 20 })));
    expect(onResize).toHaveBeenLastCalledWith(80, 40);
    await act(async () => {
      mocks.onContainerResize?.();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
    expect(terminal.resize.mock.calls.every(([, rows]) => rows === 40)).toBe(true);
    expect(onResize.mock.calls.every(([, rows]) => rows === 40)).toBe(true);
    expect(hasNativeCodexTrustPrompt(actions.getBufferText())).toBe(true);

    await act(async () => root.render(createElement(SizeHarness, { collapsed: false })));
    expect(actions.fit()).toEqual({ cols: 80, rows: 12 });
    expect(terminal.rows).toBe(12);
    expect(terminal.options.disableStdin).toBe(false);
    expect(onResize).toHaveBeenLastCalledWith(80, 12);
  });

  it('joins actual xterm soft wraps while preserving hard line breaks and spaces', async () => {
    mocks.bufferLines.push(
      { isWrapped: false, translateToString: vi.fn((trim: boolean) => trim ? '❯ Yes, I trust this' : '❯ Yes, I trust this ') },
      { isWrapped: true, translateToString: vi.fn(() => 'folder') },
      { isWrapped: false, translateToString: vi.fn(() => '  No, exit') },
    );
    let readBuffer!: () => string;
    const BufferHarness = () => {
      const { terminalRef, getBufferText } = useTerminal({ theme });
      useEffect(() => { readBuffer = getBufferText; }, [getBufferText]);
      return createElement('div', { ref: terminalRef });
    };
    await act(async () => root.render(createElement(BufferHarness)));
    expect(readBuffer()).toBe('❯ Yes, I trust this folder\n  No, exit');
    expect(mocks.bufferLines[0].translateToString).toHaveBeenCalledWith(false);
  });

  it('redraws on pure color changes, restores the theme, and skips equal new objects', async () => {
    await act(async () => root.render(createElement(Harness)));
    const terminal = mocks.terminals.at(-1)!;
    terminal.refresh.mockClear();
    await act(async () => root.render(createElement(Harness, { foreground: '#123456' })));
    expect(terminal.options.theme?.foreground).toBe('#123456');
    expect(terminal.options.theme?.red).toBe(theme.red);
    expect(terminal.refresh).toHaveBeenCalledWith(0, 23);
    terminal.refresh.mockClear();
    await act(async () => root.render(createElement(Harness, { newThemeObject: true, foreground: '#123456' })));
    expect(terminal.refresh).not.toHaveBeenCalled();
    await act(async () => root.render(createElement(Harness)));
    expect(terminal.options.theme?.foreground).toBe(theme.foreground);
    expect(terminal.refresh).toHaveBeenCalledOnce();
  });

  it('honors caller props without consuming global configuration, including login terminals', async () => {
    useConfigStore.getState().hydrate({ regionTypography: { terminal: { fontSize: 40, color: '#123456' } } });
    const LoginTerminal = () => {
      const { terminalRef } = useTerminal({ fontSize: 11, theme });
      return createElement('div', { ref: terminalRef });
    };
    await act(async () => root.render(createElement(LoginTerminal)));
    const terminal = mocks.terminals.at(-1)!;
    expect(terminal.options.fontSize).toBe(11);
    expect(terminal.options.theme?.foreground).toBe(theme.foreground);
  });

  it('ignores delayed font loading callbacks after unmount', async () => {
    let resolveFonts!: (value: unknown[]) => void;
    fontLoad.mockImplementation(() => new Promise((resolve) => { resolveFonts = resolve; }));
    await act(async () => root.render(createElement(Harness)));
    const terminal = mocks.terminals.at(-1)!;
    expect(fontLoad).toHaveBeenCalled();
    await act(async () => root.render(null));
    expect(terminal.dispose).toHaveBeenCalledOnce();
    terminal.refresh.mockClear();
    mocks.fit.mockClear();
    await act(async () => resolveFonts([]));
    expect(terminal.refresh).not.toHaveBeenCalled();
    expect(mocks.fit).not.toHaveBeenCalled();
  });
});
