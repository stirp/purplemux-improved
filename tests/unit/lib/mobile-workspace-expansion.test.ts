import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Run the sheet's event handlers with persistent hook state without mounting its portals.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async (importOriginal) => ({
  ...await importOriginal<typeof import('react')>(),
  useMemo: (compute: () => unknown) => compute(),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.values.length) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    }];
  },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/hooks/use-workspace-store', () => ({
  default: (select: (state: unknown) => unknown) => select({ sidebarTab: 'workspace', groups: [] }),
}));
vi.mock('@/hooks/use-tab-store', () => ({
  default: (select: (state: unknown) => unknown) => select({ tabs: {} }),
}));
vi.mock('@/hooks/use-tab-metadata-store', () => ({
  default: (select: (state: unknown) => unknown) => select({ metadata: {} }),
}));
vi.mock('@/hooks/use-sidebar-items', () => ({ default: () => ({ items: [] }) }));
vi.mock('@/hooks/use-touch-drag', () => ({ default: () => vi.fn() }));
vi.mock('@/hooks/use-navigation-drag', () => ({ default: () => () => ({}) }));
vi.mock('@/components/features/workspace/notification-sheet', () => ({
  useNotificationCount: () => ({ attentionCount: 0, busyCount: 0 }),
  NotificationPanel: () => null,
}));

import MobileNavigationSheet from '@/components/features/mobile/mobile-navigation-sheet';

type Element = ReactElement<{ children?: ReactNode; 'aria-expanded'?: boolean; title?: string; onClick?: () => void; onOpenChange?: (open: boolean) => void }>;
const elements = (node: ReactNode): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Element['props']>(node)) return [];
  return [node, ...elements(node.props.children)];
};

const render = (activeWorkspaceId = 'parent', onSelectSurface = vi.fn()) => {
  hooks.cursor = 0;
  return MobileNavigationSheet({
    open: true,
    onOpenChange: vi.fn(),
    workspaces: [
      { id: 'parent', name: 'Parent', directories: ['/Users/test/project', '/srv/second'] },
      { id: 'child', name: 'Child', directories: ['/srv/child'], parentWorkspaceId: 'parent' },
      { id: 'grandchild', name: 'Grandchild', directories: [], parentWorkspaceId: 'child' },
    ],
    activeWorkspaceId,
    workspaceLayouts: {
      parent: [{ type: 'pane', id: 'pane', activeTabId: 'terminal', tabs: [
        { id: 'terminal', sessionName: 'session', name: 'Terminal', order: 0 },
      ] }],
    },
    activePaneId: null,
    activeTabId: null,
    onSelectSurface,
    onCreateWorkspace: vi.fn(async () => {}),
    onOpenSettings: vi.fn(),
    onReorderTabs: vi.fn(async () => {}),
  });
};

beforeEach(() => { hooks.values = []; hooks.cursor = 0; });

describe('mobile workspace expansion', () => {
  it('shows every directory, including child paths and collapsed workspace paths', () => {
    let tree = render();
    const paths = () => elements(tree).filter((element) => element.type === 'span' && element.props.title);
    expect(paths().map((element) => element.props.children)).toEqual(['~/project', '/srv/second', '/srv/child']);
    expect(paths()[0].props.title).toBe('/Users/test/project');

    const parent = elements(tree).find((element) => element.key === 'parent')!;
    elements(parent).find((element) => element.type === 'button')!.props.onClick!();
    tree = render();
    expect(paths().map((element) => element.props.children)).toEqual(['~/project', '/srv/second']);
  });

  it('keeps ancestor expansion consistent when opening and collapsing nested workspaces', () => {
    let tree = render('grandchild');
    const button = (key: string) => elements(elements(tree).find((element) => element.key === key))
      .find((element) => element.type === 'button')!;
    expect(button('parent').props['aria-expanded']).toBe(true);
    expect(button('child').props['aria-expanded']).toBe(true);
    button('child').props.onClick!();
    tree = render('grandchild');
    expect(elements(tree).some((element) => element.key === 'grandchild')).toBe(false);
    expect(button('parent').props['aria-expanded']).toBe(true);
    expect(button('child').props['aria-expanded']).toBe(false);
    button('child').props.onClick!();
    tree = render('grandchild');
    expect(elements(tree).some((element) => element.key === 'grandchild')).toBe(true);
  });

  it('renders usable expanded tabs and removes collapsed tabs without relying on CSS grid', () => {
    const onSelectSurface = vi.fn();
    let tree = render('parent', onSelectSurface);
    const terminal = elements(tree).find((element) => element.key === 'terminal')!;
    elements(terminal).find((element) => element.type === 'button')!.props.onClick!();
    expect(onSelectSurface).toHaveBeenCalledWith('parent', 'pane', 'terminal');
    const parent = elements(tree).find((element) => element.key === 'parent')!;
    elements(parent).find((element) => element.type === 'button')!.props.onClick!();
    tree = render();
    expect(elements(tree).some((element) => element.key === 'terminal')).toBe(false);
  });

  it('honors explicit collapse of the active workspace and restores it on navigation reopen', () => {
    let tree = render();
    expect(elements(tree).some((element) => element.key === 'child')).toBe(true);
    const parent = elements(tree).find((element) => element.key === 'parent')!;
    const button = elements(parent).find((element) => element.type === 'button')!;
    button.props.onClick!();

    tree = render();
    expect(elements(tree).some((element) => element.key === 'parent')).toBe(true);
    expect(elements(tree).some((element) => element.key === 'child')).toBe(false);

    tree.props.onOpenChange(true);
    tree = render();
    expect(elements(tree).some((element) => element.key === 'child')).toBe(true);
  });
});
