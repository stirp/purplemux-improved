import { createElement, type ReactNode } from 'react';
import { renderToString } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import WorktreeTreeDialog from '@/components/features/workspace/worktree-tree-dialog';

const { state, translate } = vi.hoisted(() => ({
  state: { workspaces: [] as { id: string; name: string; parentWorkspaceId?: string }[] },
  translate: (key: string) => key,
}));
vi.mock('next-intl', () => ({ useTranslations: () => translate }));
vi.mock('@/hooks/use-workspace-store', () => ({ default: (select: (value: unknown) => unknown) => select(state) }));
vi.mock('@/components/features/workspace/manage-worktrees-dialog', () => ({ default: () => createElement('div', null, 'repository-management') }));
vi.mock('@/components/ui/dialog', () => {
  const Box = ({ children }: { children: ReactNode }) => createElement('div', null, children);
  return { Dialog: Box, DialogContent: Box, DialogDescription: Box, DialogHeader: Box, DialogTitle: Box };
});

it('shows repository management alone without children and both views with children', () => {
  const root = { id: 'ws-root', name: 'Root', directories: [] };
  state.workspaces = [root];
  const props = { root, onClose: vi.fn(), onSelect: vi.fn() };
  const standalone = renderToString(createElement(WorktreeTreeDialog, props));
  expect(standalone).toContain('repository-management');
  expect(standalone).not.toContain('relationships</button>');

  state.workspaces = [root, { id: 'ws-child', name: 'Child', parentWorkspaceId: root.id }];
  const withChildren = renderToString(createElement(WorktreeTreeDialog, props));
  expect(withChildren).toContain('relationships</button>');
  expect(withChildren).toContain('title</button>');
});
