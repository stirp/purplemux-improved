// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import DeleteWorkspaceDialog from '@/components/features/workspace/delete-workspace-dialog';
import type { IWorkspace } from '@/types/terminal';
import type { IManagedWorktree, IWorktreeOverview, TWorktreeBlocker } from '@/types/worktree';

const { store, notifications, dialog } = vi.hoisted(() => ({
  store: {
    deleteWorkspace: vi.fn(), removeWorkspace: vi.fn(), removeWorktree: vi.fn(),
    markPendingDelete: vi.fn(), unmarkPendingDelete: vi.fn(),
  },
  notifications: { warning: vi.fn(), success: vi.fn() },
  dialog: { onOpenChange: (_open: boolean) => {} },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string, values?: object) => `${key}${values ? JSON.stringify(values) : ''}` }));
vi.mock('sonner', () => ({ toast: notifications }));
vi.mock('@/hooks/use-workspace-store', () => ({ default: { getState: () => store } }));
vi.mock('@/components/ui/alert-dialog', () => {
  const Box = ({ children }: { children: ReactNode }) => createElement('div', null, children);
  return {
    AlertDialog: ({ children, onOpenChange }: { children: ReactNode; onOpenChange: (open: boolean) => void }) => {
      dialog.onOpenChange = onOpenChange;
      return createElement('div', null, children);
    },
    AlertDialogContent: Box, AlertDialogHeader: Box, AlertDialogTitle: Box,
    AlertDialogDescription: Box, AlertDialogFooter: Box,
  };
});

const workspace: IWorkspace = { id: 'ws-child', name: 'Child', directories: ['/worktree'] };
const head = 'a'.repeat(40);
const item = (overrides: Partial<IManagedWorktree> = {}): IManagedWorktree => ({
  directory: '/worktree', head, branch: 'task/one', main: false, locked: false,
  missing: false, prunable: false, sessions: [], blockers: [], lastOpenedAt: null,
  workspaces: [{ id: workspace.id, name: workspace.name }],
  status: { modified: 0, staged: 0, untracked: 0, ignored: 0, ignoredPaths: [], conflicts: 0, upstream: null, ahead: null, behind: null, operation: null },
  ...overrides,
});
const overview = (items = [item()]): IWorktreeOverview => ({
  repositories: [{ id: '/repo/.git', directory: '/repo', worktrees: items }], errors: [],
});
let root: Root;
let container: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
let close = vi.fn<() => void>();
const mount = async (props: Partial<Parameters<typeof DeleteWorkspaceDialog>[0]> = {}) => {
  await act(async () => root.render(createElement(DeleteWorkspaceDialog, { workspace, onClose: close, ...props })));
};
const button = (label: string) => [...container.querySelectorAll('button')].find((element) => element.textContent === label)!;
const checkbox = (index = 0) => container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index];
const click = async (element: HTMLElement) => { await act(async () => element.click()); };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  fetchMock = vi.fn().mockResolvedValue(Response.json(overview()));
  vi.stubGlobal('fetch', fetchMock);
  store.deleteWorkspace.mockResolvedValue(true);
  store.removeWorktree.mockResolvedValue({ removedWorkspaceIds: [workspace.id], warnings: [] });
  container = document.createElement('div');
  root = createRoot(container);
  close = vi.fn<() => void>();
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('defaults to project deletion, keeps files, and supports the desktop completion callback', async () => {
  const onDeleteProject = vi.fn().mockResolvedValue(true);
  await mount({ onDeleteProject });
  expect(checkbox().checked).toBe(false);
  expect(container.textContent).toContain('deleteWorkspaceDirectoryRetained');
  await click(button('delete'));
  expect(onDeleteProject).toHaveBeenCalledOnce();
  expect(store.deleteWorkspace).not.toHaveBeenCalled();
  expect(store.removeWorktree).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it('preserves ordinary mobile deletion and leaves failed project deletion open', async () => {
  store.deleteWorkspace.mockResolvedValueOnce(false);
  await mount();
  await click(button('delete'));
  expect(store.removeWorkspace).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
  expect(container.textContent).toContain('deleteFailed');
  await click(button('delete'));
  expect(store.deleteWorkspace).toHaveBeenLastCalledWith(workspace.id);
  expect(store.removeWorkspace).toHaveBeenCalledWith(workspace.id);
  expect(store.removeWorktree).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it('deletes the associated external worktree with its confirmed snapshot and preserves the branch', async () => {
  fetchMock.mockResolvedValue(Response.json(overview([
    item({ directory: '/sibling', workspaces: [{ id: 'ws-other', name: 'Other' }] }),
    item({ workspaces: [{ id: workspace.id, name: workspace.name }, { id: 'ws-linked', name: 'Linked' }] }),
  ])));
  const onDeleteProject = vi.fn();
  await mount({ onDeleteProject });
  await click(checkbox());
  expect(container.textContent).toContain('/worktree');
  expect(container.textContent).not.toContain('/sibling');
  expect(container.textContent).toContain('task/one');
  expect(container.textContent).toContain('Child, Linked');
  await click(button('delete'));
  expect(store.removeWorktree).toHaveBeenCalledExactlyOnceWith(workspace.id, {
    repositoryId: '/repo/.git', directory: '/worktree', head, branch: 'task/one',
    deleteBranch: false, closeIdleSessions: true, confirmedIgnoredPaths: [],
  });
  expect(store.markPendingDelete).toHaveBeenCalledWith('ws-linked');
  expect(store.unmarkPendingDelete).toHaveBeenCalledWith('ws-linked');
  expect(store.deleteWorkspace).not.toHaveBeenCalled();
  expect(onDeleteProject).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledOnce();
});

it.each(['plain', 'main', 'sibling', 'multiple', 'load-failure', 'partial-overview'])('does not offer unsafe deletion for %s', async (scenario) => {
  const data = overview(scenario === 'plain' ? [] : scenario === 'main' ? [item({ main: true })]
    : scenario === 'sibling' ? [item({ workspaces: [{ id: 'ws-other', name: 'Other' }] })]
    : scenario === 'multiple' ? [item(), item({ directory: '/other-worktree' })] : [item()]);
  if (scenario === 'partial-overview') data.errors.push({ directory: '/other', error: 'unavailable' });
  fetchMock.mockResolvedValue(scenario === 'load-failure'
    ? Response.json({ error: 'Offline' }, { status: 503 }) : Response.json(data));
  await mount();
  expect(checkbox() === undefined || checkbox().disabled).toBe(true);
  await click(button('delete'));
  expect(store.removeWorktree).not.toHaveBeenCalled();
  expect(store.deleteWorkspace).toHaveBeenCalledOnce();
});

it.each<TWorktreeBlocker>(['dirty', 'locked', 'missing', 'unknown', 'detached', 'sharedWorkspace', 'operation'])('blocks %s without deleting the project', async (blocker) => {
  fetchMock.mockResolvedValue(Response.json(overview([item({ blockers: [blocker] })])));
  await mount();
  await click(checkbox());
  expect(container.textContent).toContain(`reasons.${blocker}`);
  expect(button('delete').disabled).toBe(true);
  await click(button('delete'));
  expect(store.deleteWorkspace).not.toHaveBeenCalled();
  expect(store.removeWorktree).not.toHaveBeenCalled();
});

it('requires ignored-file confirmation and resets both choices on refresh and reopening', async () => {
  const data = overview([item({ status: { ...item().status!, ignored: 1, ignoredPaths: ['cache/'] } })]);
  fetchMock.mockImplementation(async () => Response.json(data));
  await mount();
  await click(checkbox());
  expect(container.textContent).toContain('cache/');
  expect(button('delete').disabled).toBe(true);
  await click(checkbox(1));
  expect(button('delete').disabled).toBe(false);
  await click(button('refresh'));
  expect(checkbox().checked).toBe(false);
  await click(checkbox());
  expect(checkbox(1).checked).toBe(false);
  await click(checkbox(1));
  await click(button('delete'));
  expect(store.removeWorktree.mock.calls[0][1].confirmedIgnoredPaths).toEqual(['cache/']);
  await act(async () => root.render(null));
  await mount();
  expect(checkbox().checked).toBe(false);
});

it.each(['sessions', 'changed', 'ignored'])('keeps the project after a server %s rejection and permits refresh and retry', async (code) => {
  fetchMock.mockImplementation(async () => Response.json(overview([item({ blockers: ['sessions'] })])));
  store.removeWorktree.mockRejectedValueOnce(Object.assign(new Error(code), { code }));
  await mount();
  await click(checkbox());
  await click(button('delete'));
  expect(close).not.toHaveBeenCalled();
  expect(store.deleteWorkspace).not.toHaveBeenCalled();
  expect(container.textContent).toContain(`reasons.${code}`);
  expect(store.unmarkPendingDelete).toHaveBeenCalledWith(workspace.id);
  await click(button('refresh'));
  await click(checkbox());
  await click(button('delete'));
  expect(close).toHaveBeenCalledOnce();
});

it('retains the project and reports partial cleanup without claiming complete success', async () => {
  store.removeWorktree.mockResolvedValue({ removedWorkspaceIds: [], warnings: ['workspaceCleanupFailed'] });
  await mount();
  await click(checkbox());
  await click(button('delete'));
  expect(notifications.warning).toHaveBeenCalledWith('workspaceCleanupFailed');
  expect(notifications.success).not.toHaveBeenCalled();
  expect(container.textContent).toContain('workspaceCleanupFailed');
  expect(store.deleteWorkspace).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it('blocks duplicate submission and closing during deletion, and cancellation makes no mutation', async () => {
  let finish!: (result: { removedWorkspaceIds: string[]; warnings: string[] }) => void;
  store.removeWorktree.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await mount();
  await click(button('cancel'));
  expect(store.deleteWorkspace).not.toHaveBeenCalled();
  expect(store.removeWorktree).not.toHaveBeenCalled();
  close.mockClear();
  await click(checkbox());
  await click(button('delete'));
  expect(button('working').disabled).toBe(true);
  await click(button('working'));
  await click(button('cancel'));
  await act(async () => dialog.onOpenChange(false));
  expect(close).not.toHaveBeenCalled();
  expect(store.removeWorktree).toHaveBeenCalledOnce();
  await act(async () => finish({ removedWorkspaceIds: [workspace.id], warnings: [] }));
  expect(close).toHaveBeenCalledOnce();
});
