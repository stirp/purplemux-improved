// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceItem from '@/components/features/workspace/workspace-item';
import WorktreeManagementButton from '@/components/features/workspace/worktree-management-button';
import MobileWorkspaceActions from '@/components/features/mobile/mobile-workspace-actions';
import useTouchDrag from '@/hooks/use-touch-drag';
import useWorkspaceStore from '@/hooks/use-workspace-store';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
const workspace = { id: 'ws-test', name: 'Project', directories: ['/demo'] };
const select = vi.fn();
const drag = vi.fn();
let container: HTMLDivElement;
let root: Root;
const original = useWorkspaceStore.getState();

const Harness = ({ mobile, searching = false }: { mobile: boolean; searching?: boolean }) => {
  const onTouchStartCapture = useTouchDrag();
  const mobileProps = {
    workspace, onCreated: select,
    children: createElement('button', { draggable: true, 'data-touch-context-menu': '', onClick: select, onDragStart: drag }, 'Project'),
  };
  return mobile
    ? createElement('div', { onTouchStartCapture }, createElement(MobileWorkspaceActions, mobileProps))
    : createElement('div', { draggable: !searching, onTouchStartCapture, onDragStart: drag }, createElement(WorkspaceItem, {
      workspace, isActive: false, isDeleting: false, showShortcut: false, tabs: [],
      onSelect: select, onRename: vi.fn(), onDelete: vi.fn(),
    }));
};

const touch = (type: string, y = 20) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'touches', { value: type === 'touchend' ? [] : [{ identifier: 1, clientX: 20, clientY: y }] });
  return event;
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  useWorkspaceStore.setState({ workspaces: [workspace], groups: [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWorkspaceStore.setState(original);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([100, 400])('keeps search results scrollable after a %sms hold without starting drag', async (delay) => {
  await act(async () => root.render(createElement(Harness, { mobile: false, searching: true })));
  const row = container.querySelector('[data-touch-context-menu]') as HTMLElement;
  const move = touch('touchmove', 70);
  await act(async () => {
    row.dispatchEvent(touch('touchstart'));
    vi.advanceTimersByTime(delay);
    row.dispatchEvent(move);
    vi.advanceTimersByTime(1000);
    row.dispatchEvent(touch('touchend'));
  });
  expect(move.defaultPrevented).toBe(false);
  expect(drag).not.toHaveBeenCalled();
  expect(document.querySelector('[role="menu"]')).toBeNull();
});

it('cancels a native drag from the management icon before it reaches the workspace', async () => {
  const open = vi.fn();
  await act(async () => root.render(createElement('div', { draggable: true, onDragStart: drag, onClick: select },
    createElement(WorktreeManagementButton, { name: 'Project', onClick: open }))));
  const button = container.querySelector('button')!;
  const start = new Event('dragstart', { bubbles: true, cancelable: true });
  expect(button.draggable).toBe(true);
  await act(async () => button.querySelector('svg')!.dispatchEvent(start));
  expect(start.defaultPrevented).toBe(true);
  expect(drag).not.toHaveBeenCalled();
  await act(async () => button.click());
  expect(open).toHaveBeenCalledOnce();
  expect(select).not.toHaveBeenCalled();
});

describe.each([
  { mobile: false, searching: false },
  { mobile: false, searching: true },
  { mobile: true, searching: false },
])('real workspace menu, mobile=$mobile, searching=$searching', ({ mobile, searching }) => {
  it('ignores a touch hold on the management control', async () => {
    await act(async () => root.render(createElement(Harness, { mobile, searching })));
    const icon = container.querySelector('[data-touch-drag-ignore] svg')!;
    await act(async () => icon.dispatchEvent(touch('touchstart')));
    await act(async () => vi.advanceTimersByTime(700));
    await act(async () => icon.dispatchEvent(touch('touchend')));
    expect(document.querySelector(mobile ? '[data-slot="popover-content"]' : '[role="menu"]')).toBeNull();
    expect(drag).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it.each(['ContextMenu', 'F10'])('opens from keyboard %s without selecting the workspace', async (key) => {
    await act(async () => root.render(createElement(Harness, { mobile, searching })));
    const row = container.querySelector('[data-touch-context-menu]') as HTMLElement;
    await act(async () => row.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: key === 'F10', bubbles: true, cancelable: true })));
    expect(document.querySelector(mobile ? '[data-slot="popover-content"]' : '[role="menu"]')).not.toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('opens from a stationary touch and suppresses release click', async () => {
    await act(async () => root.render(createElement(Harness, { mobile, searching })));
    const row = container.querySelector('[data-touch-context-menu]') as HTMLElement;
    await act(async () => row.dispatchEvent(touch('touchstart')));
    await act(async () => vi.advanceTimersByTime(650));
    expect(document.body.textContent).toContain(mobile ? 'worktree.create' : 'create');
    expect(document.querySelector(mobile ? '[data-slot="popover-content"]' : '[role="menu"]')).not.toBeNull();
    await act(async () => { row.dispatchEvent(touch('touchend')); row.click(); });
    expect(select).not.toHaveBeenCalled();
    expect(drag).not.toHaveBeenCalled();
  });
  it.each([false, true])('accepts the first menu action within 400ms, release click=%s', async (releaseClick) => {
    await act(async () => root.render(createElement(Harness, { mobile, searching })));
    const row = container.querySelector('[data-touch-context-menu]') as HTMLElement;
    await act(async () => row.dispatchEvent(touch('touchstart')));
    await act(async () => vi.advanceTimersByTime(650));
    await act(async () => {
      row.dispatchEvent(touch('touchend'));
      if (releaseClick) row.click();
      vi.advanceTimersByTime(100);
    });
    const menu = document.querySelector(mobile ? '[data-slot="popover-content"]' : '[role="menu"]')!;
    const rename = Array.from(menu.querySelectorAll<HTMLElement>('button, [role="menuitem"]')).find((item) => item.textContent === 'rename')!;
    await act(async () => rename.click());
    expect(document.querySelector('input')).not.toBeNull();
    expect(select).not.toHaveBeenCalled();
  });

  it('keeps a short tap selectable and scrolling free of menus', async () => {
    await act(async () => root.render(createElement(Harness, { mobile, searching })));
    const row = container.querySelector('[data-touch-context-menu]') as HTMLElement;
    await act(async () => {
      row.dispatchEvent(touch('touchstart'));
      row.dispatchEvent(touch('touchend'));
      row.click();
    });
    expect(select).toHaveBeenCalledOnce();
    await act(async () => {
      row.dispatchEvent(touch('touchstart'));
      row.dispatchEvent(touch('touchmove', 70));
      vi.advanceTimersByTime(1000);
    });
    expect(document.querySelector(mobile ? '[data-slot="popover-content"]' : '[role="menu"]')).toBeNull();
    expect(drag).not.toHaveBeenCalled();
  });
});
