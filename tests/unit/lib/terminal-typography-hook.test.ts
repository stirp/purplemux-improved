// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ITerminalOptions } from '@xterm/xterm';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import useTerminal from '@/hooks/use-terminal';
import useConfigStore from '@/hooks/use-config-store';
import { resolveTerminalTypography } from '@/lib/terminal-appearance';
import { getTerminalTheme } from '@/lib/terminal-themes';

const mocks = vi.hoisted(() => ({
  terminals: [] as { options: ITerminalOptions; refresh: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }[],
  fit: vi.fn(),
  translate: (key: string) => key,
}));
vi.mock('next-intl', () => ({ useTranslations: () => mocks.translate }));
vi.mock('@/lib/multiline-url-link-provider', () => ({ createMultilineUrlLinkProvider: () => ({}) }));
vi.mock('@xterm/xterm', () => ({ Terminal: class {
  options: ITerminalOptions;
  cols = 80;
  rows = 24;
  unicode = { activeVersion: '' };
  refresh = vi.fn();
  dispose = vi.fn();
  constructor(options: ITerminalOptions) { this.options = options; mocks.terminals.push(this); }
  loadAddon() {}
  registerLinkProvider() {}
  open() {}
  onData() {}
  onTitleChange() {}
  onWriteParsed() {}
  attachCustomKeyEventHandler() {}
} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = mocks.fit; } }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@xterm/addon-unicode11', () => ({ Unicode11Addon: class {} }));
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: class {} }));

let root: Root;
let container: HTMLDivElement;
let fontLoad: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.terminals.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
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
