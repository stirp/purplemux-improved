import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Run the sheet's event handlers with persistent hook state without mounting its portals.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const selectWorkspace = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/use-sidebar-actions', () => ({ useSelectWorkspace: () => selectWorkspace }));
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
vi.mock('@/hooks/use-visual-viewport', () => ({ default: () => undefined }));
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

import { Input } from '@/components/ui/input';
import MobileWorkspaceActions from '@/components/features/mobile/mobile-workspace-actions';
import MobileNavigationSheet from '@/components/features/mobile/mobile-navigation-sheet';

type Element = ReactElement<{ children?: ReactNode; 'aria-expanded'?: boolean; title?: string; workspace?: { directories: string[] }; onClick?: () => void; onOpenChange?: (open: boolean) => void; draggable?: boolean; value?: string; onChange?: (event: { target: { value: string } }) => void; onKeyDown?: (event: { key: string; nativeEvent: { isComposing: boolean }; stopPropagation: () => void }) => void }>;
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
      child: [{ type: 'pane', id: 'empty-pane', activeTabId: null, tabs: [] }],
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

beforeEach(() => { hooks.values = []; hooks.cursor = 0; selectWorkspace.mockClear(); });

describe('mobile workspace expansion', () => {
  it.each(['parent', 'child', 'grandchild'])('selects workspace %s even with empty or uncached tabs', (workspaceId) => {
    const tree = render('grandchild');
    const row = elements(tree).find((element) => element.key === workspaceId)!;
    elements(row).find((element) => element.type === 'button')!.props.onClick!();
    expect(selectWorkspace).toHaveBeenCalledExactlyOnceWith(workspaceId);
  });

  it('passes complete directories to the actions panel without repeating them in rows', () => {
    const tree = render();
    const actions = elements(tree).filter((element) => element.type === MobileWorkspaceActions);
    expect(actions.map((element) => element.props.workspace?.directories)).toEqual([
      ['/Users/test/project', '/srv/second'], ['/srv/child'],
    ]);
    expect(elements(tree).filter((element) => element.type === 'span' && element.props.title?.startsWith('/'))).toHaveLength(0);
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
    expect(selectWorkspace).not.toHaveBeenCalled();
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


describe('mobile workspace search', () => {
  const search = (tree: ReactNode) => elements(tree).find((element) => element.type === Input)!;
  it('matches a child directory, retains ancestors and prevents sorting', () => {
    search(render()).props.onChange!({ target: { value: '/srv/child' } });
    const tree = render();
    expect(elements(tree).filter((e) => ['parent', 'child', 'grandchild'].includes(String(e.key))).map((e) => e.key)).toEqual(['parent', 'child']);
    const rows = elements(tree).filter((e) => e.type === 'button' && e.props['aria-expanded'] !== undefined);
    expect(rows).toHaveLength(2);
    expect(rows.every((e) => e.props.draggable === false)).toBe(true);
  });

  it('does not clear a composing query or let Escape close the sheet', () => {
    search(render()).props.onChange!({ target: { value: '子项目' } });
    const stop = vi.fn();
    search(render()).props.onKeyDown!({ key: 'Escape', nativeEvent: { isComposing: true }, stopPropagation: stop });
    expect(search(render()).props.value).toBe('子项目');
    expect(stop).toHaveBeenCalledOnce();
    search(render()).props.onKeyDown!({ key: 'Escape', nativeEvent: { isComposing: false }, stopPropagation: stop });
    expect(search(render()).props.value).toBe('');
  });

  it.each([
    { expanded: false, target: 'parent' },
    { expanded: false, target: 'child' },
    { expanded: true, target: 'parent' },
  ])('selects $target in search without changing the original expansion ($expanded)', ({ expanded, target }) => {
    const rowButton = (tree: ReactNode, id: string) => elements(elements(tree).find((element) => element.key === id))
      .find((element) => element.type === 'button')!;
    if (!expanded) rowButton(render(), 'parent').props.onClick!();
    selectWorkspace.mockClear();
    search(render()).props.onChange!({ target: { value: 'Grandchild' } });
    let tree = render();
    expect(rowButton(tree, 'parent').props['aria-expanded']).toBe(true);
    rowButton(tree, target).props.onClick!();
    expect(selectWorkspace).toHaveBeenCalledExactlyOnceWith(target);
    tree = render(target);
    expect(rowButton(tree, 'parent').props['aria-expanded']).toBe(true);
    expect(elements(tree).some((element) => element.key === 'grandchild')).toBe(true);
    search(tree).props.onChange!({ target: { value: '' } });
    tree = render(target);
    expect(rowButton(tree, 'parent').props['aria-expanded']).toBe(expanded);
    expect(elements(tree).some((element) => element.key === 'child')).toBe(expanded);
    expect(elements(tree).some((element) => element.key === 'grandchild')).toBe(false);
  });

  it('restores explicit collapse after searching a hidden child', () => {
    const tree = render();
    const parent = elements(tree).find((element) => element.key === 'parent')!;
    elements(parent).find((element) => element.type === 'button')!.props.onClick!();
    search(render()).props.onChange!({ target: { value: 'Child' } });
    expect(elements(render()).some((element) => element.key === 'child')).toBe(true);
    search(render()).props.onChange!({ target: { value: '' } });
    expect(elements(render()).some((element) => element.key === 'child')).toBe(false);
  });
});
