// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SWRConfig, type Cache } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalKeyBar from '@/components/features/workspace/terminal-key-bar';
import MobileTerminalToolbar from '@/components/features/mobile/mobile-terminal-toolbar';
import { DEFAULT_TERMINAL_KEYS, type ITerminalKeySetting } from '@/lib/terminal-keys';

const mocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { name: string }) => values ? `${key} ${values.name}` : key }));
vi.mock('sonner', () => ({ toast: mocks }));

let root: Root;
let container: HTMLDivElement;
let keys: ITerminalKeySetting[];
let failSave: boolean;
let failLoad: boolean;
let saveGate: Promise<void> | undefined;
let cache: Cache;
const send = vi.fn();
const setCtrl = vi.fn();
const setShift = vi.fn();

const render = async (armed = false) => {
  await act(async () => root.render(createElement(SWRConfig, {
    value: { provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false },
  }, createElement(TerminalKeyBar, {
    sendStdin: send, ctrlActive: armed, shiftActive: armed, setCtrlActive: setCtrl, setShiftActive: setShift,
  }))));
};
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((node) => node.textContent === label || node.getAttribute('aria-label') === label)!;
const click = async (label: string) => { await act(async () => button(label).click()); };
const toggle = async (name: string) => {
  const label = Array.from(document.querySelectorAll('label')).find((node) => node.textContent === name)!;
  await act(async () => (label.querySelector('[role="checkbox"]') as HTMLElement).click());
};
const toolbarNames = () => Array.from(container.querySelectorAll('button')).map((node) => node.getAttribute('aria-label'));

beforeEach(() => {
  vi.clearAllMocks();
  keys = DEFAULT_TERMINAL_KEYS.map((key) => ({ ...key }));
  failSave = false;
  failLoad = false;
  saveGate = undefined;
  cache = new Map();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (!options) return { ok: !failLoad, json: async () => keys };
    if (saveGate) await saveGate;
    if (failSave) return { ok: false };
    keys = JSON.parse(String(options.body)).keys;
    return { ok: true, json: async () => keys };
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('terminal key bar', () => {
  it('uses the same configuration in the mobile toolbar and clears hidden modifiers in its input', async () => {
    keys.reverse();
    keys = keys.map((key) => ({ ...key, visible: key.id !== 'tab' }));
    await act(async () => root.render(createElement(SWRConfig, {
      value: { provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false },
    }, createElement(MobileTerminalToolbar, { sendStdin: send, terminalConnected: true }))));
    expect(toolbarNames()[1]).toBe('F12');
    expect(toolbarNames()).not.toContain('Tab');
    await click('F12');
    expect(send).toHaveBeenCalledExactlyOnceWith('\x1b[24~');
    await click('Ctrl');
    expect(container.querySelector('textarea')?.placeholder).toBe('Ctrl + ...');
    await click('keyBarManage');
    await toggle('Ctrl');
    await click('save');
    expect(container.querySelector('textarea')?.placeholder).toBe('commandPlaceholder');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('sends all twelve xterm function key sequences and retains ordinary keys and modifiers', async () => {
    await render();
    const expected = ['\x1bOP', '\x1bOQ', '\x1bOR', '\x1bOS', '\x1b[15~', '\x1b[17~',
      '\x1b[18~', '\x1b[19~', '\x1b[20~', '\x1b[21~', '\x1b[23~', '\x1b[24~'];
    for (let index = 0; index < expected.length; index++) {
      await click(`F${index + 1}`);
      expect(send).toHaveBeenLastCalledWith(expected[index]);
    }
    await click('Tab');
    expect(send).toHaveBeenLastCalledWith('\t');
    await click('Ctrl');
    await click('Shift');
    expect(setCtrl).toHaveBeenLastCalledWith(true);
    expect(setShift).toHaveBeenLastCalledWith(true);
    expect(send).toHaveBeenCalledTimes(13);
  });

  it('cancels without saving or executing, then persists order and visibility only after successful save', async () => {
    await render();
    await click('keyBarManage');
    await click('keyBarMoveDown Tab');
    await toggle('Esc');
    await click('cancel');
    expect(toolbarNames().slice(0, 2)).toEqual(['Tab', 'Esc']);
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method)).toBe(true);
    await click('keyBarManage');
    await click('keyBarMoveDown Tab');
    await toggle('Tab');
    let finish!: () => void;
    saveGate = new Promise((resolve) => { finish = resolve; });
    await click('save');
    expect(toolbarNames().slice(0, 2)).toEqual(['Tab', 'Esc']);
    expect(button('cancel').disabled).toBe(true);
    await act(async () => finish());
    expect(toolbarNames()[0]).toBe('Esc');
    expect(toolbarNames()).not.toContain('Tab');
    expect(keys[1]).toEqual({ id: 'tab', visible: false });
    expect(send).not.toHaveBeenCalled();
  });

  it('preserves a failed draft, allows retry, and clears hidden active modifiers', async () => {
    await render(true);
    await click('keyBarManage');
    await click('keyBarMoveDown Tab');
    await toggle('Ctrl');
    await toggle('Shift');
    failSave = true;
    await click('save');
    expect(mocks.error).toHaveBeenCalledWith('keyBarSaveFailed');
    expect(toolbarNames().slice(0, 2)).toEqual(['Tab', 'Esc']);
    expect(setCtrl).not.toHaveBeenCalled();
    expect(document.querySelectorAll('[role="checkbox"][aria-checked="false"]')).toHaveLength(2);
    failSave = false;
    await click('save');
    expect(toolbarNames().slice(0, 2)).toEqual(['Esc', 'Tab']);
    expect(setCtrl).toHaveBeenLastCalledWith(false);
    expect(setShift).toHaveBeenLastCalledWith(false);
  });

  it('keeps settings reachable with all keys hidden and can restore a key', async () => {
    keys = keys.map((key) => ({ ...key, visible: false }));
    await render();
    expect(toolbarNames()).toEqual(['keyBarManage']);
    await click('keyBarManage');
    await toggle('F12');
    await click('save');
    expect(toolbarNames()).toEqual(['F12', 'keyBarManage']);
    expect(send).not.toHaveBeenCalled();
  });

  it('shows load failure without editing defaults and retries with the stored order', async () => {
    failLoad = true;
    keys.reverse();
    await render();
    await click('keyBarManage');
    expect(document.querySelector('form')).toBeNull();
    failLoad = false;
    await click('keyBarLoadFailed · retry');
    expect(document.querySelector('form')).not.toBeNull();
    await click('save');
    expect(toolbarNames()[0]).toBe('F12');
  });
});
