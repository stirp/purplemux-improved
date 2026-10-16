// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Sidebar from '@/components/layout/sidebar';
import useWorkspaceStore from '@/hooks/use-workspace-store';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: '/' }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/hooks/use-workspace-layouts', () => ({ default: () => ({}) }));
vi.mock('@/hooks/use-sidebar-items', () => ({ default: () => ({ items: [] }) }));
vi.mock('@/components/layout/sidebar-rate-limits', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/notification-sheet', () => ({
  useNotificationCount: () => ({ attentionCount: 0, busyCount: 0 }),
  NotificationPanel: () => null,
}));

const initialWorkspace = useWorkspaceStore.getState();
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useWorkspaceStore.setState({
    workspaces: [
      { id: 'match', name: '项目 プロジェクト 프로젝트', directories: [] },
      { id: 'other', name: 'Other', directories: [] },
    ],
    groups: [], isLoading: false, sidebarCollapsed: false, sidebarTab: 'workspace',
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWorkspaceStore.setState(initialWorkspace);
  vi.unstubAllGlobals();
});

it.each(['项目', 'プロジェクト', '프로젝트'])('preserves the query %s on composing Escape and clears after composition ends', async (query) => {
  const bubbled = vi.fn();
  await act(async () => root.render(createElement('div', { onKeyDown: bubbled }, createElement(Sidebar))));
  const input = container.querySelector<HTMLInputElement>('[aria-label="searchWorkspaces"]')!;
  const rows = () => container.querySelectorAll('.workspace-tree-row-compact');
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(rows()).toHaveLength(1);
  const composingEscape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, isComposing: true });
  await act(async () => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    input.dispatchEvent(composingEscape);
  });
  expect(input.value).toBe(query);
  expect(rows()).toHaveLength(1);
  expect(composingEscape.defaultPrevented).toBe(false);
  bubbled.mockClear();
  await act(async () => {
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(input.value).toBe('');
  expect(rows()).toHaveLength(2);
  expect(bubbled).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(input);
});
