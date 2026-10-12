// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
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
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabStore from '@/hooks/use-tab-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { NotificationPanel } from '@/components/features/workspace/notification-sheet';
import { toast } from 'sonner';
import { navigateToSession } from '@/hooks/use-session-navigation';

let container: HTMLDivElement;
let root: Root;
const layoutMock = vi.hoisted(() => ({ activeTab: null as null | { id: string; agentState: { providerId: string; sessionId: string } } }));
const initialWorkspace = useWorkspaceStore.getState();
const fetchMock = vi.fn();
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
  vi.unstubAllGlobals();
});
describe('Sessions workflow controls', () => {
  it('allows restoring old session A after its active tab is reused for B', async () => {
    layoutMock.activeTab = { id: 't', agentState: { providerId: 'codex', sessionId: 's2' } };
    await act(async () => root.render(createElement(NotificationPanel)));
    const historyRow = container.querySelector('p')!.closest('[class*="rounded-md"]') as HTMLElement;
    await act(async () => historyRow.click());
    expect(navigateToSession).toHaveBeenCalledWith(expect.objectContaining({ agentSessionId: 's1' }), null);
  });
  it('disables navigation only for the same active provider and session', async () => {
    layoutMock.activeTab = { id: 't', agentState: { providerId: 'codex', sessionId: 's1' } };
    await act(async () => root.render(createElement(NotificationPanel)));
    const historyRow = container.querySelector('p')!.closest('[class*="rounded-md"]') as HTMLElement;
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
