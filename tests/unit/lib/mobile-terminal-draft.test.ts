// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SWRConfig, type Cache } from 'swr';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MobileSurfaceView from '@/components/features/mobile/mobile-surface-view';
import { DEFAULT_TERMINAL_KEYS } from '@/lib/terminal-keys';
import type { TConnectionStatus } from '@/types/terminal';

const connection = vi.hoisted(() => ({
  status: 'connected' as TConnectionStatus,
  send: vi.fn(),
  noop: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/use-terminal', () => ({ default: () => ({
  terminalRef: { current: null }, isReady: false,
  write: connection.noop, clear: connection.noop, reset: connection.noop,
  fit: () => ({ cols: 40, rows: 24 }), focus: connection.noop,
  focusAtBottom: connection.noop, getBufferText: () => '',
}) }));
vi.mock('@/hooks/use-terminal-websocket', () => ({ default: () => ({
  status: connection.status, retryCount: 0, disconnectReason: null,
  connect: connection.noop, disconnect: connection.noop, reconnect: connection.noop,
  sendStdin: connection.send, sendWebStdin: connection.send, sendResize: connection.noop,
}) }));
vi.mock('@/hooks/use-agent-install-check', () => ({ useAgentInstallCheck: () => ({ installDialogs: null }) }));
vi.mock('@/components/features/workspace/web-browser-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/diff-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/agent-sessions-panel', () => ({ default: () => null }));
vi.mock('@/components/features/mobile/mobile-claude-code-panel', () => ({ default: () => null }));
vi.mock('@/components/features/mobile/mobile-codex-panel', () => ({ default: () => null }));

let root: Root;
let container: HTMLDivElement;
let cache: Cache;
const props: ComponentProps<typeof MobileSurfaceView> = {
  paneId: 'pane', activeTabId: 'terminal', panelType: 'terminal',
  tabs: [{ id: 'terminal', name: 'Terminal', order: 0, sessionName: 'test-session', panelType: 'terminal' }],
  onCreateTab: async () => null, onDeleteTab: async () => {},
  onSwitchTab: connection.noop, onRemoveTabLocally: connection.noop,
  onUpdateTabPanelType: connection.noop, onUpdateDiffSettings: connection.noop,
};
const render = async (status: TConnectionStatus) => {
  connection.status = status;
  await act(async () => root.render(createElement(SWRConfig, {
    value: { provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false },
  }, createElement(MobileSurfaceView, props))));
};
const button = (name: string) => Array.from(document.querySelectorAll('button'))
  .find((node) => node.textContent === name || node.getAttribute('aria-label') === name)!;
const click = async (name: string) => { await act(async () => button(name).click()); };
const fill = async (selector: string, value: string) => {
  await act(async () => {
    const node = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    const prototype = node instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  cache = new Map();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () =>
    url === '/api/terminal-keys' ? DEFAULT_TERMINAL_KEYS
      : [{ id: 'one', name: 'status', command: 'git status' }],
  })));
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

it.each(['edit status', 'customCommandsAdd'])('preserves the mobile %s draft across disconnect and reconnect', async (action) => {
  await render('connected');
  await click('customCommandsManage');
  await click(action);
  await fill('[role="dialog"] input', 'Unsaved name');
  await fill('[role="dialog"] textarea', 'echo unsaved\necho draft');
  const dialog = document.querySelector('[role="dialog"]');

  for (const status of ['disconnected', 'connecting', 'connected'] as const) {
    await render(status);
    expect(document.querySelector('[role="dialog"]')).toBe(dialog);
    expect((document.querySelector('[role="dialog"] input') as HTMLInputElement).value).toBe('Unsaved name');
    expect((document.querySelector('[role="dialog"] textarea') as HTMLTextAreaElement).value).toBe('echo unsaved\necho draft');
    expect(button('status').disabled).toBe(status !== 'connected');
    expect(!!container.querySelector('textarea')).toBe(status === 'connected');
    expect(!!container.querySelector('button[aria-label="Tab"]')).toBe(status === 'connected');
  }
  expect(connection.send).not.toHaveBeenCalled();
  expect(vi.mocked(fetch).mock.calls.every((args) => !args[1]?.method)).toBe(true);
});
