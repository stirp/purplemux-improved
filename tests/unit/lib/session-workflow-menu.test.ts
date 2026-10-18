// @vitest-environment jsdom
vi.mock('@/hooks/use-is-mobile', () => ({ default: () => false }));
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: '/' }) }));
vi.mock('@/hooks/use-layout', () => ({ useLayoutStore: (select: (state: unknown) => unknown) => select({ layout: null }), navigateToTab: vi.fn() }));
vi.mock('@/hooks/use-session-navigation', () => ({ navigateToSession: vi.fn() }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabStore from '@/hooks/use-tab-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { NotificationPanel } from '@/components/features/workspace/notification-sheet';
import { reconcileSessionWorkflow } from '@/lib/session-workflow';
import { navigateToSession } from '@/hooks/use-session-navigation';

let container: HTMLDivElement;
let root: Root;
const initialWorkspace = useWorkspaceStore.getState();
const initialTabs = useTabStore.getState();
const initialHistory = useSessionHistoryStore.getState();
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  vi.clearAllMocks();
  useWorkspaceStore.setState({
    workspaces: [{ id: 'ws', name: 'Workspace', directories: ['/project'] }],
    sessionWorkflow: reconcileSessionWorkflow({ statuses: {}, collapsed: {} }, [], { t: {
      workspaceId: 'ws', workspaceName: 'Workspace', workspaceDir: '/project', panelType: 'codex-cli', agentSessionId: 'A',
    } }),
  });
  useTabStore.setState({ tabs: {} });
  useSessionHistoryStore.setState({ entries: [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(NotificationPanel, { workspaceLayouts: {} })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWorkspaceStore.setState(initialWorkspace);
  useTabStore.setState(initialTabs);
  useSessionHistoryStore.setState(initialHistory);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const row = () => container.querySelector('[data-session-row] [data-session-navigation]') as HTMLElement;
const touchEvent = (type: string, x = 10) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ clientX: x, clientY: 10 }] });
  return event;
};
describe('entry-less session menu with real Base UI trigger', () => {
  it('opens deletion from its explicit button without navigating', async () => {
    await act(async () => (container.querySelector('[aria-label="deleteHistory"]') as HTMLButtonElement).click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(navigateToSession).not.toHaveBeenCalled();
  });
  it('opens the delete menu on right click and opens its confirmation', async () => {
    await act(async () => row().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })));
    const item = document.querySelector('[role="menuitem"]') as HTMLElement;
    expect(item?.textContent).toContain('deleteHistory');
    expect(navigateToSession).not.toHaveBeenCalled();
    await act(async () => item.click());
    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
  it('opens the delete menu after a mobile long press', async () => {
    await act(async () => row().dispatchEvent(touchEvent('touchstart')));
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
    await act(async () => vi.advanceTimersByTime(500));
    expect(document.querySelector('[role="menuitem"]')?.textContent).toContain('deleteHistory');
    expect(navigateToSession).not.toHaveBeenCalled();
  });
  it.each(['touchend', 'touchmove'])('cancels long press on %s', async (type) => {
    await act(async () => {
      row().dispatchEvent(touchEvent('touchstart'));
      row().dispatchEvent(touchEvent(type, 40));
      vi.advanceTimersByTime(500);
    });
    expect(document.querySelector('[role="menuitem"]')).toBeNull();
  });
  it('keeps left click navigation bound to the native identity', async () => {
    await act(async () => row().click());
    expect(navigateToSession).toHaveBeenCalledWith(expect.objectContaining({ agentSessionId: 'A', providerId: 'codex', workspaceDir: '/project' }), null);
  });
});
