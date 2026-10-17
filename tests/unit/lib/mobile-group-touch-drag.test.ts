// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MobileNavigationSheet from '@/components/features/mobile/mobile-navigation-sheet';
import useWorkspaceStore from '@/hooks/use-workspace-store';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/router', () => ({ useRouter: () => ({ pathname: '/' }) }));
vi.mock('@/hooks/use-visual-viewport', () => ({ default: () => undefined }));
vi.mock('@/hooks/use-sidebar-items', () => ({ default: () => ({ items: [] }) }));
vi.mock('@/components/layout/sidebar-rate-limits', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/notification-sheet', () => ({
  useNotificationCount: () => ({ attentionCount: 0, busyCount: 0 }),
  NotificationPanel: () => null,
}));

class TestDragEvent extends MouseEvent {
  dataTransfer: DataTransfer | null;
  constructor(type: string, options: DragEventInit) {
    super(type, options);
    this.dataTransfer = options.dataTransfer ?? null;
  }
}

const initial = useWorkspaceStore.getState();
const fetchMock = vi.fn(async () => ({ ok: true }));
let root: Root;
let container: HTMLDivElement;
let unmounted: boolean;
const Harness = () => {
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  return createElement(MobileNavigationSheet, {
    open: true, onOpenChange: vi.fn(), workspaces, activeWorkspaceId: null,
    workspaceLayouts: {}, activePaneId: null, activeTabId: null,
    onSelectSurface: vi.fn(), onCreateWorkspace: vi.fn(), onOpenSettings: vi.fn(), onReorderTabs: vi.fn(),
  });
};
const header = (name: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'))
  .find((button) => button.querySelector('span')?.textContent === name)!;
const groupIds = () => useWorkspaceStore.getState().groups.map((group) => group.id);
const touch = (type: string, y = 20, count = 1) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: Array.from({ length: type === 'touchend' || type === 'touchcancel' ? 0 : count },
    (_, i) => ({ identifier: i + 1, clientX: 20, clientY: y })) });
  return event;
};
const send = async (element: Element, event: Event) => act(async () => { element.dispatchEvent(event); });
const hold = async (element: Element) => {
  await send(element, touch('touchstart'));
  await act(async () => vi.advanceTimersByTime(350));
};
const aim = (element: Element) => {
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => element) });
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({ top: 100, height: 44 } as DOMRect);
};
const query = async (value: string) => {
  const input = document.querySelector<HTMLInputElement>('[aria-label="searchWorkspaces"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('DragEvent', TestDragEvent);
  vi.stubGlobal('DataTransfer', class { setData() {} });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockClear();
  useWorkspaceStore.setState({
    sidebarTab: 'workspace',
    groups: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', collapsed: true }, { id: 'empty', name: 'Empty' }],
    workspaces: [
      { id: 'a1', name: 'Project A', directories: [], groupId: 'a' },
      { id: 'a2', name: 'Project A child', directories: [], groupId: 'a', parentWorkspaceId: 'a1' },
      { id: 'b1', name: 'Project B', directories: [], groupId: 'b' },
    ],
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  unmounted = false;
  await act(async () => root.render(createElement(Harness)));
});

afterEach(async () => {
  if (!unmounted) await act(async () => root.unmount());
  container.remove();
  useWorkspaceStore.setState(initial, true);
  Reflect.deleteProperty(document, 'elementFromPoint');
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([
  ['A', 'Empty', 140, ['b', 'empty', 'a']],
  ['Empty', 'A', 110, ['empty', 'a', 'b']],
  ['B', 'A', 110, ['b', 'a', 'empty']],
] as const)('touch sorts %s against %s and persists the order', async (name, destination, y, expected) => {
  const source = header(name);
  const target = header(destination);
  aim(target);
  await hold(source.querySelector('span')!);
  expect(source.style.opacity).toBe('0.4');
  const move = touch('touchmove', y);
  await send(source, move);
  expect(move.defaultPrevented).toBe(true);
  expect(target.style.boxShadow).not.toBe('');
  await send(source, touch('touchend'));
  await act(async () => source.click());
  expect(groupIds()).toEqual(expected);
  expect(useWorkspaceStore.getState().groups.find((group) => group.id === 'b')?.collapsed).toBe(true);
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/workspace/group/reorder', expect.objectContaining({
    method: 'PATCH', body: JSON.stringify({ groupIds: expected }),
  }));
  expect(useWorkspaceStore.getState().workspaces.filter((workspace) => workspace.groupId === 'a').map((workspace) => workspace.id)).toEqual(['a1', 'a2']);
  expect(useWorkspaceStore.getState().workspaces.find((workspace) => workspace.id === 'b1')?.groupId).toBe('b');
  expect(source.style.opacity).toBe('');
  expect(target.style.boxShadow).toBe('');
});

it('also sorts with native mouse drag events', async () => {
  const source = header('Empty');
  const target = header('A');
  aim(target);
  const options = { bubbles: true, cancelable: true, clientY: 110, dataTransfer: new DataTransfer() };
  await send(source, new DragEvent('dragstart', options));
  await send(target, new DragEvent('dragover', options));
  await send(target, new DragEvent('drop', options));
  await send(source, new DragEvent('dragend', options));
  expect(groupIds()).toEqual(['empty', 'a', 'b']);
});

it('keeps short taps collapsible and swipes scrollable', async () => {
  const source = header('A');
  await send(source, touch('touchstart'));
  await send(source, touch('touchend'));
  await act(async () => source.click());
  expect(source.getAttribute('aria-expanded')).toBe('false');
  fetchMock.mockClear();
  await send(source, touch('touchstart'));
  const move = touch('touchmove', 80);
  await send(source, move);
  await act(async () => vi.advanceTimersByTime(700));
  await send(source, touch('touchend'));
  expect(move.defaultPrevented).toBe(false);
  expect(source.style.opacity).toBe('');
  expect(fetchMock).not.toHaveBeenCalled();
});

it.each(['cancel', 'multitouch', 'unmount', 'workspace', 'self'])('does not persist on %s', async (action) => {
  const source = header('A');
  const target = action === 'workspace' ? document.querySelector('[data-touch-context-menu]')! : action === 'self' ? source : header('B');
  aim(target);
  await hold(source);
  await send(source, touch('touchmove', 140));
  if (action === 'cancel') await send(source, touch('touchcancel'));
  if (action === 'multitouch') await send(source, touch('touchstart', 140, 2));
  if (action === 'unmount') {
    await act(async () => root.unmount());
    unmounted = true;
  }
  await send(document.body, touch('touchend'));
  expect(groupIds()).toEqual(['a', 'b', 'empty']);
  expect(fetchMock).not.toHaveBeenCalled();
});

it('keeps the more menu and rename action separate from dragging', async () => {
  const source = header('A');
  const more = source.parentElement!.querySelector<HTMLButtonElement>('[aria-label="renameGroup"]')!;
  await hold(more.querySelector('svg')!);
  await send(more, touch('touchend'));
  await act(async () => more.click());
  expect(source.style.opacity).toBe('');
  const rename = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent === 'renameGroup')!;
  expect(rename).toBeDefined();
  await act(async () => rename.click());
  expect(document.querySelector<HTMLInputElement>('input[value="A"]')).not.toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('disables group dragging while searching and restores it when cleared', async () => {
  await query('Project');
  const source = header('A');
  expect(source.draggable).toBe(false);
  await hold(source);
  const move = touch('touchmove', 140);
  await send(source, move);
  await send(source, touch('touchend'));
  expect(move.defaultPrevented).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
  await query('');
  expect(header('A').draggable).toBe(true);
  aim(header('Empty'));
  await hold(header('A'));
  await send(header('A'), touch('touchmove', 140));
  await send(header('A'), touch('touchend'));
  expect(groupIds()).toEqual(['b', 'empty', 'a']);
});
