// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Sidebar from '@/components/layout/sidebar';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useSidebarActions from '@/hooks/use-sidebar-actions';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: '/' }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/hooks/use-workspace-layouts', () => ({ default: () => ({}) }));
vi.mock('@/hooks/use-sidebar-items', () => ({ default: () => ({ items: [] }) }));
vi.mock('@/hooks/use-sidebar-actions', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/hooks/use-sidebar-actions')>(),
  useSelectWorkspace: () => (id: string) => {
    useSidebarActions.getState().revealWorkspace(id);
    useWorkspaceStore.setState({ activeWorkspaceId: id });
  },
}));
vi.mock('@/components/layout/sidebar-rate-limits', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/notification-sheet', () => ({
  useNotificationCount: () => ({ attentionCount: 0, busyCount: 0 }),
  NotificationPanel: () => null,
}));

const initialWorkspace = useWorkspaceStore.getState();
const initialActions = useSidebarActions.getState();
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

const mountTree = async () => {
  useWorkspaceStore.setState({
    activeWorkspaceId: 'a',
    workspaces: [
      { id: 'a', name: 'A', directories: [] },
      { id: 'a1', name: 'A1', directories: [], parentWorkspaceId: 'a' },
      { id: 'a11', name: 'A11', directories: [], parentWorkspaceId: 'a1' },
      { id: 'a2', name: 'A2', directories: [], parentWorkspaceId: 'a' },
      { id: 'a21', name: 'A21', directories: [], parentWorkspaceId: 'a2' },
      { id: 'b', name: 'B', directories: [] },
      { id: 'b1', name: 'B1', directories: [], parentWorkspaceId: 'b' },
    ],
  });
  await act(async () => root.render(createElement(Sidebar)));
};
const row = (name: string) => container.querySelector<HTMLElement>(`.workspace-tree-row-compact[aria-label="${name}"]`);
const disclosure = (name: string) => row(name)!.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
const click = async (element: HTMLElement) => act(async () => element.click());
const query = async (value: string) => {
  const input = container.querySelector<HTMLInputElement>('[aria-label="searchWorkspaces"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

it('expands multiple roots and siblings, hides descendants and restores their expansion', async () => {
  await mountTree();
  await click(disclosure('A1'));
  await click(disclosure('A2'));
  await click(disclosure('B'));
  expect(row('A11')).not.toBeNull();
  expect(row('A21')).not.toBeNull();
  expect(row('B1')).not.toBeNull();
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('a');
  await click(row('B1')!);
  expect(row('A11')).not.toBeNull();
  expect(row('A21')).not.toBeNull();
  expect(row('B1')!.querySelector('button[aria-expanded]')).toBeNull();
  await click(disclosure('A'));
  expect(row('A1')).toBeNull();
  expect(row('A11')).toBeNull();
  expect(row('A21')).toBeNull();
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('b1');
  await click(disclosure('A'));
  expect(row('A11')).not.toBeNull();
  expect(row('A21')).not.toBeNull();
  expect(row('B1')).not.toBeNull();
});

it('reveals external navigation additively and preserves explicit collapse through sync', async () => {
  await mountTree();
  await click(disclosure('B'));
  await act(async () => useWorkspaceStore.setState({ activeWorkspaceId: 'a11' }));
  expect(row('A11')).not.toBeNull();
  expect(row('B1')).not.toBeNull();
  await click(disclosure('A'));
  await act(async () => useWorkspaceStore.setState({ workspaces: structuredClone(useWorkspaceStore.getState().workspaces) }));
  expect(row('A11')).toBeNull();
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('a11');
  expect(row('B1')).not.toBeNull();
});

it('does not change expansion when selecting search results', async () => {
  await mountTree();
  await click(disclosure('A'));
  await click(disclosure('B'));
  await query('A11');
  expect(row('A11')).not.toBeNull();
  expect(disclosure('A').disabled).toBe(true);
  await click(row('A11')!);
  await query('');
  expect(row('A1')).toBeNull();
  expect(row('B1')).not.toBeNull();
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('a11');
});

it('isolates disclosure drag and double click from row actions', async () => {
  await mountTree();
  const button = disclosure('A');
  const drag = new Event('dragstart', { bubbles: true, cancelable: true });
  await act(async () => {
    button.querySelector('svg')!.dispatchEvent(drag);
    button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  expect(drag.defaultPrevented).toBe(true);
  expect(row('A')!.querySelector('input')).toBeNull();
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('a');
});

it.each(['button', 'svg'])('isolates disclosure %s context menus while preserving the row menu', async (target) => {
  await mountTree();
  const button = disclosure('B');
  const element = target === 'svg' ? button.querySelector('svg')! : button;
  const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 });
  await act(async () => { element.dispatchEvent(contextMenu); });
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(contextMenu.defaultPrevented).toBe(true);
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('a');
  await act(async () => {
    row('B')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
  });
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('a');
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWorkspaceStore.setState(initialWorkspace);
  useSidebarActions.setState(initialActions, true);
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
