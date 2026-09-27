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

type Element = ReactElement<{ children?: ReactNode; onClick?: () => void; onOpenChange?: (open: boolean) => void }>;
const elements = (node: ReactNode): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Element['props']>(node)) return [];
  return [node, ...elements(node.props.children)];
};

const render = () => {
  hooks.cursor = 0;
  return MobileNavigationSheet({
    open: true,
    onOpenChange: vi.fn(),
    workspaces: [
      { id: 'parent', name: 'Parent', directories: [] },
      { id: 'child', name: 'Child', directories: [], parentWorkspaceId: 'parent' },
    ],
    activeWorkspaceId: 'parent',
    workspaceLayouts: {},
    activePaneId: null,
    activeTabId: null,
    onSelectSurface: vi.fn(),
    onCreateWorkspace: vi.fn(async () => {}),
    onOpenSettings: vi.fn(),
    onReorderTabs: vi.fn(async () => {}),
  });
};

beforeEach(() => { hooks.values = []; hooks.cursor = 0; });

describe('mobile workspace expansion', () => {
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
