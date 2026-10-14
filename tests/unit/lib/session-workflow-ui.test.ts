// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: { count: number }) => values ? `${key} ${values.count}` : key }));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: '/' }) }));
vi.mock('@/hooks/use-layout', () => ({
  useLayoutStore: (select: (state: unknown) => unknown) => select({
    layout: layoutMock.activeTab ? { activePaneId: 'pane', root: {
      type: 'pane', id: 'pane', activeTabId: layoutMock.activeTab.id, tabs: [layoutMock.activeTab],
    } } : null,
  }),
  navigateToTab: vi.fn(),
}));
vi.mock('@/hooks/use-session-navigation', () => ({ navigateToSession: vi.fn() }));
vi.mock('@/components/features/workspace/session-history-actions', () => ({
  default: ({ children, provider, sessionId, onDeleted }: {
    children: React.ReactNode; provider: string; sessionId: string; onDeleted: () => Promise<void>;
  }) => createElement('div', { 'data-session-id': sessionId, 'data-provider': provider },
    children, createElement('button', { onClick: () => void onDeleted(), 'data-delete-session': sessionId }, 'Delete')),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabStore from '@/hooks/use-tab-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { NotificationPanel } from '@/components/features/workspace/notification-sheet';
import { toast } from 'sonner';
import { reconcileSessionWorkflow } from '@/lib/session-workflow';
import { navigateToSession } from '@/hooks/use-session-navigation';

let container: HTMLDivElement;
let root: Root;
const layoutMock = vi.hoisted(() => ({ activeTab: null as null | { id: string; agentState: { providerId: string; sessionId: string } } }));
const initialWorkspace = useWorkspaceStore.getState();
const initialTabs = useTabStore.getState();
const initialHistory = useSessionHistoryStore.getState();
const fetchMock = vi.fn();
const search = async (query: string) => {
  await act(async () => {
    const input = container.querySelector('input')!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  vi.clearAllMocks();
  layoutMock.activeTab = null;
  useWorkspaceStore.setState({
    workspaces: [{ id: 'ws', name: 'Workspace', directories: [] }],
    sessionWorkflow: { statuses: {}, collapsed: {} },
    syncWorkspaces: vi.fn(async () => {}),
  });
  useTabStore.setState({ tabs: {} });
  useSessionHistoryStore.setState({ entries: [{
    id: 'e', workspaceId: 'ws', workspaceName: 'Workspace', workspaceDir: '/project',
    tabId: 't', providerId: 'codex', agentSessionId: 's1', prompt: 'Implement work', result: 'Done',
    startedAt: 1, completedAt: 2, duration: 1, dismissedAt: null, toolUsage: {}, touchedFiles: [],
  }] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(NotificationPanel)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWorkspaceStore.setState(initialWorkspace);
  useTabStore.setState(initialTabs);
  useSessionHistoryStore.setState(initialHistory);
  vi.unstubAllGlobals();
});
describe('Sessions workflow controls', () => {
  it('always shows the current project name on history, earlier turns and search results', async () => {
    const latest = { ...useSessionHistoryStore.getState().entries[0], workspaceName: '  ' };
    await act(async () => {
      useWorkspaceStore.setState({ workspaces: [{ id: 'ws', name: 'Renamed project', directories: [] }] });
      useSessionHistoryStore.setState({ entries: [latest, { ...latest, id: 'older', completedAt: 1, prompt: 'Earlier prompt' }] });
    });
    expect(container.querySelector('[data-session-id="s1"] [title="Renamed project"]')).not.toBeNull();
    await act(async () => (Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.startsWith('showMore'))!).click());
    expect(container.querySelectorAll('[title="Renamed project"]')).toHaveLength(2);
    await search('Earlier prompt');
    expect(container.querySelectorAll('[title="Renamed project"]')).toHaveLength(2);
    await act(async () => useWorkspaceStore.setState({ workspaces: [{ id: 'ws', name: 'New project', directories: [] }] }));
    expect(container.querySelectorAll('[title="New project"]')).toHaveLength(2);
    await search('New project');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('searchCount 1');
    expect(container.querySelectorAll('[title="New project"]')).toHaveLength(2);
    expect(container.textContent).toContain('Earlier prompt');
    expect(Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.startsWith('showMore'))?.getAttribute('aria-expanded')).toBe('true');
  });

  it('shows project names for active and entry-less indexed sessions independently of titles', async () => {
    const workflow = reconcileSessionWorkflow({ statuses: {}, collapsed: {} }, [], { old: {
      workspaceId: 'deleted-ws', workspaceName: 'Archived project', workspaceDir: '/archived', panelType: 'codex-cli', agentSessionId: 'archived',
    } });
    await act(async () => {
      useSessionHistoryStore.setState({ entries: [] });
      useWorkspaceStore.setState({ sessionWorkflow: workflow });
      useTabStore.getState().initTab('live', { workspaceId: 'ws', panelType: 'claude-code', agentSessionId: 'live', cliState: 'busy', lastUserMessage: 'Different session title' });
    });
    expect(container.querySelector('[title="Workspace"]')).not.toBeNull();
    expect(container.querySelector('[title="Archived project"]')).not.toBeNull();
    expect(container.textContent).toContain('Different session title');
  });

  it('falls back to a directory name, an ID and an unknown label instead of an empty project line', async () => {
    const entry = useSessionHistoryStore.getState().entries[0];
    await act(async () => {
      useWorkspaceStore.setState({ workspaces: [] });
      useSessionHistoryStore.setState({ entries: [{ ...entry, workspaceName: '', workspaceDir: '/code/legacy-project/' }] });
    });
    expect(container.querySelector('[title="legacy-project"]')).not.toBeNull();
    await act(async () => useSessionHistoryStore.setState({ entries: [{ ...entry, workspaceName: ' ', workspaceDir: null }] }));
    expect(container.querySelector('[title="ws"]')).not.toBeNull();
    await act(async () => useSessionHistoryStore.setState({ entries: [{ ...entry, workspaceId: '', workspaceName: '', workspaceDir: null }] }));
    expect(container.querySelector('[title="unknownWorkspace"]')).not.toBeNull();
  });

  it('searches older results through collapsed groups and restores preferences after clearing', async () => {
    const latest = useSessionHistoryStore.getState().entries[0];
    await act(async () => {
      useSessionHistoryStore.setState({ entries: [latest, { ...latest, id: 'older', completedAt: 1, prompt: 'Earlier prompt', result: 'Unique result' }] });
      useWorkspaceStore.setState({ sessionWorkflow: { statuses: {}, collapsed: { review: true } } });
    });
    expect(container.querySelector('select')).toBeNull();
    await search('  UNIQUE RESULT  ');
    expect(container.querySelector('section > button')?.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[role="status"]')?.textContent).toBe('searchCount 1');
    expect(container.textContent).toContain('Earlier prompt');
    expect(container.textContent).toContain('Unique result');
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => (container.querySelector('[aria-label="searchClear"]') as HTMLButtonElement).click());
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelector('section > button')?.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(container.querySelector('input'));
    expect(useWorkspaceStore.getState().sessionWorkflow.collapsed).toEqual({ review: true });
  });

  it('preserves manually expanded older records across search and Escape', async () => {
    const latest = useSessionHistoryStore.getState().entries[0];
    await act(async () => useSessionHistoryStore.setState({ entries: [latest, { ...latest, id: 'older', completedAt: 1, prompt: 'Earlier prompt' }] }));
    await act(async () => (Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.startsWith('showMore'))!).click());
    expect(container.textContent).toContain('Earlier prompt');
    await search('not-found');
    expect(container.textContent).toContain('searchEmpty');
    const bubbled = vi.fn();
    document.addEventListener('keydown', bubbled);
    await act(async () => container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true })));
    expect(container.querySelector('input')!.value).toBe('not-found');
    bubbled.mockClear();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    await act(async () => container.querySelector('input')!.dispatchEvent(escape));
    expect(escape.defaultPrevented).toBe(true);
    expect(bubbled).not.toHaveBeenCalled();
    expect(container.querySelector('input')!.value).toBe('');
    expect(container.textContent).toContain('Earlier prompt');
    document.removeEventListener('keydown', bubbled);
  });

  it('searches current titles and reacts to synchronized changes without querying the server', async () => {
    await search('renamed');
    expect(container.textContent).toContain('searchEmpty');
    await act(async () => useWorkspaceStore.setState({ sessionWorkflow: { statuses: {}, collapsed: {}, titles: { 'codex:s1': 'Renamed session' } } }));
    expect(container.querySelector('select')).not.toBeNull();
    expect(container.textContent).toContain('Renamed session');
    await act(async () => useWorkspaceStore.setState({ sessionWorkflow: { statuses: {}, collapsed: {}, deleted: ['codex:s1'] } }));
    expect(container.textContent).toContain('searchEmpty');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('matches live metadata titles and keeps the underlying workspace status collection intact', async () => {
    await act(async () => useTabStore.getState().initTab('live', {
      workspaceId: 'ws', panelType: 'claude-code', agentProviderId: 'claude', agentSessionId: 'live-session', cliState: 'busy',
      sessionMetaCache: { sessionId: 'live-session', jsonlPath: null, meta: { title: 'Current metadata title' } as NonNullable<import('@/hooks/use-tab-store').ITabState['sessionMetaCache']>['meta'] },
    }));
    await search('metadata title');
    expect(container.querySelectorAll('select')).toHaveLength(1);
    expect(container.textContent).toContain('Current metadata title');
    expect(Object.keys(useTabStore.getState().tabs)).toEqual(['live']);
    expect(useSessionHistoryStore.getState().entries).toHaveLength(1);
    await act(async () => useWorkspaceStore.setState({ workspaces: [{ id: 'ws', name: 'Workspace', directories: ['/new/workspace-path'] }] }));
    await search('/new/workspace-path');
    expect(container.querySelectorAll('select')).toHaveLength(2);
    await search('  ');
    expect(container.querySelectorAll('select')).toHaveLength(2);
  });

  it('retains navigation and status editing in search results', async () => {
    await search('Implement');
    const row = container.querySelector('[data-session-id="s1"] [class*="rounded-md"]') as HTMLElement;
    await act(async () => row.click());
    expect(navigateToSession).toHaveBeenCalledWith(expect.objectContaining({ agentSessionId: 's1' }), null);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ statuses: { 'codex:s1': 'completed' }, collapsed: {} }) });
    await act(async () => {
      const select = container.querySelector('select')!;
      select.value = 'completed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('section > button')?.textContent).toContain('workStatus_completed (1)');
    expect(container.querySelector('input')!.value).toBe('Implement');
    await act(async () => (container.querySelector('[data-delete-session="s1"]') as HTMLButtonElement).click());
    expect(container.textContent).toContain('searchEmpty');
  });

  it('restores and removes native session A without a turn while active tab runs B', async () => {
    const a = { workspaceId: 'ws', workspaceName: 'Workspace', workspaceDir: '/project', panelType: 'codex-cli', agentSessionId: 'A' };
    const first = reconcileSessionWorkflow({ statuses: {}, collapsed: {} }, [], { t: a });
    const second = reconcileSessionWorkflow(first, [], { t: { ...a, agentSessionId: 'B' } });
    layoutMock.activeTab = { id: 't', agentState: { providerId: 'codex', sessionId: 'B' } };
    await act(async () => {
      useSessionHistoryStore.setState({ entries: [] });
      useWorkspaceStore.setState({ sessionWorkflow: second });
      useTabStore.getState().initTab('t', { workspaceId: 'ws', panelType: 'codex-cli', agentProviderId: 'codex', agentSessionId: 'B', cliState: 'busy' });
      root.render(createElement(NotificationPanel));
    });
    const row = container.querySelector('[data-session-id="A"] [class*="rounded-md"]') as HTMLElement;
    expect(row).not.toBeNull();
    await act(async () => row.click());
    expect(navigateToSession).toHaveBeenLastCalledWith(expect.objectContaining({
      providerId: 'codex', agentSessionId: 'A', workspaceDir: '/project',
    }), null);
    await act(async () => (container.querySelector('[data-delete-session="A"]') as HTMLButtonElement).click());
    expect(container.querySelector('[data-session-id="A"]')).toBeNull();
    expect(container.querySelector('[data-session-id="B"]')).not.toBeNull();
    expect(useWorkspaceStore.getState().sessionWorkflow.deleted).toContain('codex:A');
  });
  it('restores the native identity of entry-less sessions after the Tab has closed', async () => {
    const saved = reconcileSessionWorkflow({ statuses: {}, collapsed: {} }, [], { t: {
      workspaceId: 'ws', workspaceName: 'Workspace', workspaceDir: '/project', panelType: 'codex-cli', agentSessionId: 'A',
    } });
    await act(async () => {
      useSessionHistoryStore.setState({ entries: [] });
      useWorkspaceStore.setState({ sessionWorkflow: saved });
    });
    const row = container.querySelector('[data-session-id="A"] [class*="rounded-md"]') as HTMLElement;
    await act(async () => row.click());
    expect(navigateToSession).toHaveBeenLastCalledWith(expect.objectContaining({ agentSessionId: 'A', workspaceDir: '/project' }), null);
    expect(container.querySelector('[data-delete-session="A"]')).not.toBeNull();
  });
  it('allows restoring old session A after its active tab is reused for B', async () => {
    layoutMock.activeTab = { id: 't', agentState: { providerId: 'codex', sessionId: 's2' } };
    await act(async () => root.render(createElement(NotificationPanel)));
    const historyRow = container.querySelector('[data-session-id="s1"] [class*="rounded-md"]') as HTMLElement;
    await act(async () => historyRow.click());
    expect(navigateToSession).toHaveBeenCalledWith(expect.objectContaining({ agentSessionId: 's1' }), null);
  });
  it('disables navigation only for the same active provider and session', async () => {
    layoutMock.activeTab = { id: 't', agentState: { providerId: 'codex', sessionId: 's1' } };
    await act(async () => root.render(createElement(NotificationPanel)));
    const historyRow = container.querySelector('[data-session-id="s1"] [class*="rounded-md"]') as HTMLElement;
    await act(async () => historyRow.click());
    expect(navigateToSession).not.toHaveBeenCalled();
  });
  it('moves a session after manual selection and restores automatic review', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ statuses: { 'codex:s1': 'completed' }, collapsed: {} }) });
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = 'completed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('section > button')?.textContent).toContain('workStatus_completed (1)');
    expect(fetchMock).toHaveBeenCalledWith('/api/session-workflow', expect.objectContaining({
      body: JSON.stringify({ key: 'codex:s1', status: 'completed' }),
    }));
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ statuses: {}, collapsed: {} }) });
    await act(async () => {
      const currentSelect = container.querySelector('select')!;
      currentSelect.value = 'auto';
      currentSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('section > button')?.textContent).toContain('workStatus_review (1)');
  });
  it('collapses a category while preserving its count and expands it again', async () => {
    const header = container.querySelector('section > button') as HTMLButtonElement;
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ statuses: {}, collapsed: { review: true } }) });
    await act(async () => header.click());
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(header.textContent).toContain('(1)');
    expect(container.querySelector('select')).toBeNull();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ statuses: {}, collapsed: { review: false } }) });
    await act(async () => header.click());
    expect(container.querySelector('select')).not.toBeNull();
  });
  it('retains the prior state and reports failed saves', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = 'completed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.querySelector('section > button')?.textContent).toContain('workStatus_review (1)');
    expect(toast.error).toHaveBeenCalledWith('workStatusSaveFailed');
    expect(select.disabled).toBe(false);
    expect(select.value).toBe('auto');
  });
});
