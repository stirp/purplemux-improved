// @vitest-environment jsdom
import { act, createElement, useEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type useTerminal from '@/hooks/use-terminal';
import type useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import type { ITab, TPanelType } from '@/types/terminal';

const mocks = vi.hoisted(() => ({
  terminalOptions: {} as Parameters<typeof useTerminal>[0],
  socketOptions: {} as Parameters<typeof useTerminalWebSocket>[0],
  focus: vi.fn(), fit: vi.fn(() => ({ cols: 80, rows: 24 })), send: vi.fn(), noop: vi.fn(),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/hooks/use-terminal', () => ({ default: (options: Parameters<typeof useTerminal>[0]) => {
  mocks.terminalOptions = options;
  return { terminalRef: mocks.noop, write: mocks.noop, reset: mocks.noop, clear: mocks.noop,
    fit: mocks.fit, focus: mocks.focus, focusAtBottom: mocks.focus, isReady: true, getBufferText: () => '' };
} }));
vi.mock('@/hooks/use-terminal-websocket', () => ({ default: (options: Parameters<typeof useTerminalWebSocket>[0]) => {
  mocks.socketOptions = options;
  return { status: 'connected', connect: mocks.noop, disconnect: mocks.noop, reconnect: mocks.noop,
    sendStdin: mocks.send, sendWebStdin: mocks.send, sendResize: mocks.noop };
} }));
vi.mock('@/hooks/use-terminal-theme', () => ({ default: () => ({ theme: { colors: {} } }) }));
vi.mock('@/hooks/use-is-mobile-device', () => ({ default: () => false }));
vi.mock('@/hooks/use-trust-prompt-detector', () => ({ default: () => ({}) }));
vi.mock('@/hooks/use-codex-update-prompt-detector', () => ({ default: () => ({}) }));
vi.mock('@/hooks/use-quick-prompts', () => ({ default: () => ({ prompts: [] }) }));
vi.mock('@/hooks/use-agent-install-check', () => ({ useAgentInstallCheck: () => ({}) }));
vi.mock('@/components/features/workspace/claude-code-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/codex-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/pane-tab-bar', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/agent-status-line', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/quick-prompt-bar', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/terminal-key-bar', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/terminal-commands-bar', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/agent-sessions-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/web-browser-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/diff-panel', () => ({ default: () => null }));
vi.mock('@/components/features/mobile/mobile-terminal-toolbar', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/web-input-bar', () => ({ default: (props: IInputProps) => Input(props) }));
vi.mock('@/components/features/mobile/mobile-codex-panel', () => ({ default: (props: IInputProps) => Input(props) }));
vi.mock('@/components/features/mobile/mobile-claude-code-panel', () => ({ default: (props: IInputProps) => Input(props) }));
vi.mock('react-resizable-panels', () => ({
  Group: ({ children, groupRef }: { children: ReactNode; groupRef: { current: unknown } }) => {
    useEffect(() => { groupRef.current = { setLayout: mocks.noop }; }, [groupRef]);
    return createElement('div', null, children);
  },
  Panel: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Separator: () => null,
}));

import PaneContainer from '@/components/features/workspace/pane-container';
import MobileSurfaceView from '@/components/features/mobile/mobile-surface-view';
import { useLayoutStore } from '@/hooks/use-layout';
import useTabStore from '@/hooks/use-tab-store';

interface IInputProps { focusInputRef: { current: (() => void) | undefined }; onNativeCommands: (text: string) => void }
const Input = ({ focusInputRef, onNativeCommands }: IInputProps) => {
  const [input, setInput] = useState<HTMLTextAreaElement | null>(null);
  useEffect(() => { focusInputRef.current = () => input?.focus(); }, [focusInputRef, input]);
  return createElement('div', null, createElement('textarea', { ref: setInput, 'aria-label': 'Web input', defaultValue: '确定' }),
    createElement('button', { onClick: () => onNativeCommands('/') }, 'Native menu'));
};
const initialLayout = useLayoutStore.getState();
const initialTabs = useTabStore.getState();
let root: Root;
let container: HTMLDivElement;
const tab = (panelType: TPanelType, terminalCollapsed = true): ITab => ({ id: 'tab', name: '', sessionName: 'isolated', order: 0, panelType, terminalCollapsed });
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ cwd: '/test' }) })));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  useTabStore.getState().initTab('tab', { panelType: 'codex-cli', workspaceId: 'ws', agentProcess: true, cliState: 'idle', agentSessionId: 'a', sessionView: 'timeline' });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useLayoutStore.setState(initialLayout, true);
  useTabStore.setState(initialTabs, true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const desktop = async (panelType: TPanelType, collapsed = true) => {
  useLayoutStore.setState({ workspaceId: 'ws', paneCount: 1, layout: { root: { type: 'pane', id: 'pane', tabs: [tab(panelType, collapsed)], activeTabId: 'tab' }, activePaneId: 'pane', updatedAt: '' } });
  await act(async () => root.render(createElement(PaneContainer, { paneId: 'pane', paneNumber: 1 })));
  await act(async () => mocks.socketOptions?.onConnected?.());
};
const mobile = async (panelType: TPanelType) => act(async () => root.render(createElement(MobileSurfaceView, {
  paneId: 'pane', activeTabId: 'tab', panelType, tabs: [tab(panelType)],
  onCreateTab: async () => null, onDeleteTab: async () => {}, onSwitchTab: mocks.noop,
  onRemoveTabLocally: mocks.noop, onUpdateTabPanelType: mocks.noop, onUpdateDiffSettings: mocks.noop,
})));

describe('terminal surface input ownership', () => {
  it.each(['codex-cli', 'claude-code'] as const)('keeps %s Web focus on reconnect even if the terminal is expanded', async (provider) => {
    await desktop(provider, false);
    const input = container.querySelector<HTMLTextAreaElement>('textarea')!;
    input.focus();
    mocks.focus.mockClear();
    await act(async () => mocks.socketOptions?.onConnected?.());
    expect(mocks.focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(input);
    expect(input.value).toBe('确定');
  });

  it.each(['codex-cli', 'claude-code', 'agent-sessions', 'web-browser', 'diff'] as const)('disables the desktop background terminal for %s', async (provider) => {
    await desktop(provider);
    expect(mocks.terminalOptions?.inputEnabled).toBe(false);
    expect(container.querySelector('[inert]')).not.toBeNull();
  });

  it('enables the ordinary desktop terminal', async () => {
    await desktop('terminal');
    expect(mocks.terminalOptions?.inputEnabled).toBe(true);
  });

  it.each(['codex-cli', 'claude-code'] as const)('enables the mobile %s terminal only for an explicitly opened native menu', async (provider) => {
    await mobile(provider);
    expect(mocks.terminalOptions?.inputEnabled).toBe(false);
    expect(container.querySelector('[inert]')).not.toBeNull();
    await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
    expect(mocks.terminalOptions?.inputEnabled).toBe(true);
    expect(container.querySelector('[inert]')).toBeNull();
    expect(mocks.focus).toHaveBeenCalled();
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith('/');
  });
});
