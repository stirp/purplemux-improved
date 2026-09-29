import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
const store = vi.hoisted(() => ({
  groups: [{ id: 'group-1', name: 'Group 1' }],
  workspaces: [{ id: 'ws-example', name: 'Example', directories: [], groupId: null as string | null, parentWorkspaceId: undefined as string | undefined }],
  renameWorkspace: vi.fn(async () => true),
  moveWorkspaceToGroup: vi.fn(async () => true),
}));
const startEditing = vi.hoisted(() => vi.fn());
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => undefined,
  useCallback: (callback: unknown) => callback,
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.values.length) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  },
}));
vi.mock('next-intl', () => ({ useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}` }));
vi.mock('@/hooks/use-workspace-store', () => ({
  default: Object.assign((select: (state: typeof store) => unknown) => select(store), { getState: () => store }),
}));
vi.mock('@/hooks/use-tab-store', () => ({ default: () => null, selectWorkspacePortsLabel: () => null }));
vi.mock('@/hooks/use-inline-edit', () => ({ default: () => ({ isEditing: false, draft: '', inputRef: { current: null }, startEditing }) }));

import WorkspaceItem from '@/components/features/workspace/workspace-item';
import MobileWorkspaceActions from '@/components/features/mobile/mobile-workspace-actions';
import EditWorkspaceDialog from '@/components/features/workspace/edit-workspace-dialog';
import CreateWorktreeDialog from '@/components/features/workspace/create-worktree-dialog';
import ManageWorktreesDialog from '@/components/features/workspace/manage-worktrees-dialog';
import { ContextMenuContent, ContextMenuSub, ContextMenuSubTrigger } from '@/components/ui/context-menu';
import { Popover, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

type Element = ReactElement<{
  children?: ReactNode; disabled?: boolean; mode?: string; open?: boolean;
  onClick?: () => void | Promise<void>;
  onChange?: (event: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
}>;
const elements = (node: ReactNode): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Element['props']>(node)) return [];
  return [node, ...elements(node.props.children)];
};
const text = (node: ReactNode): string => {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(text).join('');
  return isValidElement<Element['props']>(node) ? text(node.props.children) : '';
};
const directChildren = (element: Element) => (element.props.children as ReactNode[]).filter(isValidElement) as Element[];
const renderMobile = () => {
  hooks.cursor = 0;
  return MobileWorkspaceActions({ workspace: store.workspaces[0], onCreated: vi.fn(), children: null });
};
const renderDesktop = () => {
  hooks.cursor = 0;
  const component = (WorkspaceItem as unknown as { type: (props: ComponentProps<typeof WorkspaceItem>) => ReactNode }).type;
  return component({ workspace: store.workspaces[0], isActive: false, isDeleting: false, showShortcut: false,
    onSelect: vi.fn(), onRename: vi.fn(), onDelete: vi.fn() });
};
const find = (tree: ReactNode, type: unknown) => elements(tree).find((element) => element.type === type)!;
const renderDialog = (mode?: 'edit' | 'rename' | 'group', onOpenChange = vi.fn()) => {
  hooks.cursor = 0;
  return EditWorkspaceDialog({ open: true, onOpenChange, workspaceId: 'ws-example', currentName: 'Example', mode });
};
const save = (tree: ReactNode) => elements(tree).find((element) => element.type === Button && text(element).includes('common.save'))!;

beforeEach(() => {
  hooks.values = []; hooks.cursor = 0;
  store.groups = [{ id: 'group-1', name: 'Group 1' }];
  store.workspaces[0].parentWorkspaceId = undefined;
  store.workspaces[0].groupId = null;
  vi.clearAllMocks();
  store.renameWorkspace.mockResolvedValue(true);
  store.moveWorkspaceToGroup.mockResolvedValue(true);
});

describe('workspace menu order', () => {
  it('presents the same four actions before a separated delete action on both surfaces', () => {
    const expected = ['workspace.worktree.create', 'workspace.worktreeManager.title', 'sidebar.moveToGroup', 'terminal.rename', '', 'common.delete'];
    const desktop = directChildren(find(renderDesktop(), ContextMenuContent));
    expect(desktop.map((item) => text(item.type === ContextMenuSub ? find(item, ContextMenuSubTrigger) : item))).toEqual(expected);
    hooks.values = [];
    const mobile = directChildren(find(renderMobile(), PopoverContent));
    expect(mobile.map(text)).toEqual(expected);
    expect(mobile[4].type).toBe('hr');
  });

  it('keeps moving a child workspace visible but disabled on both surfaces', () => {
    store.workspaces[0].parentWorkspaceId = 'ws-parent';
    expect(find(renderDesktop(), ContextMenuSubTrigger).props.disabled).toBe(true);
    hooks.values = [];
    const group = directChildren(find(renderMobile(), PopoverContent)).find((element) => text(element) === 'sidebar.moveToGroup');
    expect(group?.props.disabled).toBe(true);
  });

  it.each([
    ['workspace.worktree.create', CreateWorktreeDialog, undefined],
    ['workspace.worktreeManager.title', ManageWorktreesDialog, undefined],
    ['sidebar.moveToGroup', EditWorkspaceDialog, 'group'],
    ['terminal.rename', EditWorkspaceDialog, 'rename'],
  ] as const)('opens the intended mobile action for %s', (label, type, mode) => {
    find(renderMobile(), Popover).props.onOpenChange!(true);
    expect(find(renderMobile(), Popover).props.open).toBe(true);
    const button = directChildren(find(renderMobile(), PopoverContent)).find((element) => text(element) === label)!;
    button.props.onClick!();
    const tree = renderMobile();
    expect(find(tree, type).props.mode).toBe(mode);
    expect(find(tree, Popover).props.open).toBe(false);
  });
});

describe('workspace edit modes', () => {
  it('renames without exposing or submitting group changes', async () => {
    let tree = renderDialog('rename');
    expect(find(tree, Select)).toBeUndefined();
    expect(save(tree).props.disabled).toBe(true);
    find(tree, Input).props.onChange!({ target: { value: 'Renamed' } });
    const close = vi.fn();
    tree = renderDialog('rename', close);
    await save(tree).props.onClick!();
    expect(store.renameWorkspace).toHaveBeenCalledWith('ws-example', 'Renamed');
    expect(store.moveWorkspaceToGroup).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledWith(false);
  });

  it('moves groups without exposing or submitting name changes', async () => {
    let tree = renderDialog('group');
    expect(find(tree, Input)).toBeUndefined();
    find(tree, Select).props.onValueChange!('group-1');
    tree = renderDialog('group');
    await save(tree).props.onClick!();
    expect(store.moveWorkspaceToGroup).toHaveBeenCalledWith('ws-example', 'group-1');
    expect(store.renameWorkspace).not.toHaveBeenCalled();
  });

  it('keeps the default combined editor compatible with the header', async () => {
    let tree = renderDialog();
    find(tree, Input).props.onChange!({ target: { value: 'Renamed' } });
    find(tree, Select).props.onValueChange!('group-1');
    tree = renderDialog();
    await save(tree).props.onClick!();
    expect(store.renameWorkspace).toHaveBeenCalledWith('ws-example', 'Renamed');
    expect(store.moveWorkspaceToGroup).toHaveBeenCalledWith('ws-example', 'group-1');
  });

  it('shows the ungrouped selection with no groups and prevents unchanged submission', () => {
    store.groups = [];
    const tree = renderDialog('group');
    expect(find(tree, Select)).toBeDefined();
    expect(save(tree).props.disabled).toBe(true);
  });

  it('retains the group dialog after a failed save', async () => {
    store.moveWorkspaceToGroup.mockResolvedValue(false);
    find(renderDialog('group'), Select).props.onValueChange!('group-1');
    const close = vi.fn();
    await save(renderDialog('group', close)).props.onClick!();
    expect(close).not.toHaveBeenCalled();
    expect(save(renderDialog('group')).props.disabled).toBe(false);
  });
});
