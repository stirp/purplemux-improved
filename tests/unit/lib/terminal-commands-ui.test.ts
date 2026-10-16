// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SWRConfig, type Cache } from 'swr';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalCommandsBar from '@/components/features/workspace/terminal-commands-bar';

const mocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: mocks }));

let root: Root;
let container: HTMLDivElement;
let commands: { id: string; name: string; command: string }[];
let failSave: boolean;
let failLoad: boolean;
const send = vi.fn();
let cache: Cache;

const render = async (connected = true, sendStdin = send) => {
  await act(async () => root.render(createElement(SWRConfig, { value: { provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false } },
    createElement(TerminalCommandsBar, { connected, sendStdin }))));
};
const button = (label: string) => Array.from(document.querySelectorAll('button')).find((node) => node.textContent === label || node.getAttribute('aria-label') === label)!;
const click = async (label: string) => { await act(async () => button(label).click()); };
const fill = async (selector: string, value: string) => {
  await act(async () => {
    const node = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    const prototype = node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  commands = [{ id: 'one', name: '状态', command: 'git status' }];
  failSave = false;
  failLoad = false;
  cache = new Map();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (!options) return { ok: !failLoad, json: async () => commands };
    if (failSave) return { ok: false };
    const value = JSON.parse(String(options.body));
    if (options.method === 'POST') commands = [...commands, { ...value, id: 'two' }];
    if (options.method === 'PATCH') commands = commands.map((command) => command.id === value.id ? value : command);
    if (options.method === 'DELETE') commands = commands.filter((command) => command.id !== value.id);
    return { ok: true, json: async () => commands };
  }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('terminal command interactions', () => {
  it('sends only to the current terminal, disables disconnected execution and never replays', async () => {
    await render();
    await click('状态');
    expect(send).toHaveBeenCalledExactlyOnceWith('git status\r');
    await render(false);
    expect(button('状态').disabled).toBe(true);
    await click('状态');
    const otherTerminal = vi.fn();
    await render(true, otherTerminal);
    expect(otherTerminal).not.toHaveBeenCalled();
    await click('状态');
    expect(otherTerminal).toHaveBeenCalledExactlyOnceWith('git status\r');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retains drafts on save failure, then saves and renames without executing', async () => {
    await render();
    await click('customCommandsManage');
    await click('customCommandsAdd');
    await fill('input', ' 打印目录 ');
    await fill('textarea', 'pwd');
    failSave = true;
    await click('save');
    expect(mocks.error).toHaveBeenCalledWith('customCommandsSaveFailed');
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('pwd');
    expect(commands).toHaveLength(1);
    failSave = false;
    await click('save');
    expect(commands[1]).toEqual({ id: 'two', name: '打印目录', command: 'pwd' });
    await click('edit 打印目录');
    await fill('input', '目录');
    await click('save');
    expect(commands[1].name).toBe('目录');
    expect(send).not.toHaveBeenCalled();
  });

  it('validates blank drafts, cancels edits and requires delete confirmation', async () => {
    await render();
    await click('customCommandsManage');
    await click('customCommandsAdd');
    await click('save');
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(2);
    await click('cancel');
    await click('edit 状态');
    await fill('input', 'unsaved');
    await click('cancel');
    expect(commands[0].name).toBe('状态');
    await click('delete 状态');
    expect(commands).toHaveLength(1);
    await click('cancel');
    expect(commands).toHaveLength(1);
    await click('delete 状态');
    await click('delete');
    expect(commands).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
  });

  it('shows load failure and retries instead of treating it as an empty list', async () => {
    failLoad = true;
    await render();
    expect(container.textContent).toContain('customCommandsLoadFailed');
    expect(container.textContent).not.toContain('customCommandsAdd');
    failLoad = false;
    await click('customCommandsLoadFailed · retry');
    expect(button('状态')).toBeDefined();
  });

  it('blocks pasted C1 controls without saving and accepts corrected Unicode commands', async () => {
    await render();
    await click('customCommandsManage');
    await click('customCommandsAdd');
    await fill('input', '粘贴命令');
    await fill('textarea', 'echo \u009b31m');
    await click('save');
    expect(document.querySelector('[role="alert"]')?.textContent).toBe('customCommandsContentInvalid');
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe('echo \u009b31m');
    expect(vi.mocked(fetch).mock.calls.every(([, options]) => !options?.method)).toBe(true);
    expect(commands).toHaveLength(1);
    const command = 'echo\t"中文 café 😀"\necho done';
    await fill('textarea', command);
    await click('save');
    expect(commands[1]).toEqual({ id: 'two', name: '粘贴命令', command });
    expect(send).not.toHaveBeenCalled();
  });
});
