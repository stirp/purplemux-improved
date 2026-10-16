// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ILayoutData } from '@/types/terminal';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: '/' }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/hooks/use-sidebar-items', () => ({ default: () => ({ items: [] }) }));
vi.mock('@/components/layout/sidebar-rate-limits', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/settings-dialog', () => ({ default: () => null }));
vi.mock('@/components/layout/app-header', () => ({
  default: ({ onMenuOpen }: { onMenuOpen: () => void }) => createElement('button', { onClick: onMenuOpen }, 'Open navigation'),
}));
vi.mock('@/components/features/mobile/mobile-workspace-tab-bar', () => ({ default: () => null }));

import Sidebar from '@/components/layout/sidebar';
import MobileLayout from '@/components/features/mobile/mobile-layout';
import NotificationSheet from '@/components/features/workspace/notification-sheet';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useWorkspaceLayoutStore from '@/hooks/use-workspace-layout-store';
import useTabStore from '@/hooks/use-tab-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { useLayoutStore } from '@/hooks/use-layout';

const initialWorkspace = useWorkspaceStore.getState();
const initialLayouts = useWorkspaceLayoutStore.getState();
const initialTabs = useTabStore.getState();
const initialHistory = useSessionHistoryStore.getState();
const initialLayout = useLayoutStore.getState();
const fetchMock = vi.fn();
let resolveRequests: () => void;
let container: HTMLDivElement;
let root: Root;

const layout = (name: string): ILayoutData => ({
  root: { type: 'pane', id: 'pane', activeTabId: 't', tabs: [{ id: 't', name, order: 0, sessionName: 'test' }] },
  activePaneId: 'pane', updatedAt: '',
});

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const pending = new Promise<void>((resolve) => { resolveRequests = resolve; });
  fetchMock.mockReset().mockImplementation(async () => {
    await pending;
    return { ok: true, json: async () => layout('Parent loaded title') };
  });
  vi.stubGlobal('fetch', fetchMock);
  useWorkspaceStore.setState({
    workspaces: [
      { id: 'ws', name: 'Project', directories: [] },
      { id: 'other', name: 'Other', directories: [] },
    ],
    groups: [], activeWorkspaceId: null, isLoading: false, sidebarCollapsed: false, sidebarTab: 'sessions',
    sessionWorkflow: { statuses: {}, collapsed: {} },
  });
  useLayoutStore.setState({ layout: null, workspaceId: null, pendingFocusTabId: null });
  useWorkspaceLayoutStore.setState({ layouts: {} });
  useSessionHistoryStore.setState({ entries: [] });
  useTabStore.setState({ tabs: {} });
  useTabStore.getState().initTab('t', {
    workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: 's', cliState: 'busy', lastUserMessage: 'Fallback title',
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => { root.unmount(); resolveRequests(); });
  container.remove();
  useWorkspaceStore.setState(initialWorkspace, true);
  useWorkspaceLayoutStore.setState(initialLayouts, true);
  useTabStore.setState(initialTabs, true);
  useSessionHistoryStore.setState(initialHistory, true);
  useLayoutStore.setState(initialLayout, true);
  vi.unstubAllGlobals();
});

const expectLayoutRequests = (count: number) => {
  expect(fetchMock).toHaveBeenCalledTimes(count);
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/layout?workspace=ws')).toHaveLength(count / 2);
  expect(fetchMock.mock.calls.filter(([url]) => url === '/api/layout?workspace=other')).toHaveLength(count / 2);
};

describe('Sessions reuse parent layout loading', () => {
  it('loads each cold workspace once in the real desktop Sidebar and follows layout updates', async () => {
    await act(async () => root.render(createElement(Sidebar)));
    expectLayoutRequests(2);
    expect(container.textContent).toContain('Fallback title');
    await act(async () => resolveRequests());
    expect(container.textContent).toContain('Parent loaded title');
    expectLayoutRequests(2);
    await act(async () => {
      const input = container.querySelector('input')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Updated title');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(container.textContent).toContain('searchEmpty');
    await act(async () => useWorkspaceLayoutStore.getState().setLayout('ws', layout('Updated title')));
    expect(container.textContent).toContain('Updated title');
    expect(container.textContent).not.toContain('Parent loaded title');
    expectLayoutRequests(2);
  });

  it('adds no requests in the closed mobile Sessions sheet and reuses the parent refresh on opening', async () => {
    await act(async () => root.render(createElement(MobileLayout, null, null)));
    expectLayoutRequests(2);
    await act(async () => resolveRequests());
    expectLayoutRequests(2);
    expect(document.querySelector('[aria-label="searchPlaceholder"]')).toBeNull();
    fetchMock.mockImplementation(async () => ({ ok: true, json: async () => layout('Refreshed mobile title') }));
    await act(async () => (Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Open navigation')!).click());
    expectLayoutRequests(4);
    expect(document.body.textContent).toContain('Refreshed mobile title');
    expect(document.body.textContent).not.toContain('Parent loaded title');
  });

  it('only loads standalone notification layouts when opened and reuses them on reopening', async () => {
    const onOpenChange = vi.fn();
    await act(async () => root.render(createElement(NotificationSheet, { open: false, onOpenChange })));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => root.render(createElement(NotificationSheet, { open: true, onOpenChange })));
    expectLayoutRequests(2);
    await act(async () => resolveRequests());
    expect(document.body.textContent).toContain('Parent loaded title');
    await act(async () => root.render(createElement(NotificationSheet, { open: false, onOpenChange })));
    await act(async () => root.render(createElement(NotificationSheet, { open: true, onOpenChange })));
    expectLayoutRequests(2);
  });
});
