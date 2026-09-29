import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IWorktreeSyncInfo } from '@/types/worktree';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effect: () => undefined as void | (() => void), request: vi.fn() }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.values.length) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    }];
  },
  useEffect: (effect: typeof hooks.effect) => { hooks.effect = effect; },
  useRef: (current: unknown) => ({ current }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key, useLocale: () => 'en' }));
vi.mock('@/lib/worktree-action-client', () => ({ requestWorktreeAction: hooks.request }));

import WorktreeDeliveryDialog from '@/components/features/workspace/worktree-delivery-dialog';
import WorktreeDraftForm from '@/components/features/workspace/worktree-draft-form';

type Element = ReactElement<{
  children?: ReactNode; value?: string; disabled?: boolean; 'data-checked'?: boolean;
  onClick?: () => void; onSelect?: () => void;
}>;
const elements = (node: ReactNode): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Element['props']>(node)) return [];
  return [node, ...elements(node.props.children)];
};
const item = { repositoryId: 'repo', directory: '/child', head: 'a'.repeat(40), branch: 'feature' };
const info = (targetRef = 'refs/heads/feature'): IWorktreeSyncInfo => ({
  head: item.head, branch: item.branch, targetRef, targetHead: item.head,
  branches: [{ ref: 'refs/heads/feature', name: 'feature' }, { ref: 'refs/heads/main', name: 'main' }],
  remotes: [], ahead: 0, behind: 0, operation: null, blockers: [], review: null,
});
const render = () => {
  hooks.cursor = 0;
  return elements(WorktreeDeliveryDialog({ workspaceId: 'ws', item, onClose: vi.fn() }));
};
const inspect = async () => {
  render();
  hooks.effect();
  await vi.waitFor(() => expect(render().some((element) => element.props.children === 'loading')).toBe(false));
  return render();
};
beforeEach(() => {
  hooks.values = []; hooks.cursor = 0; hooks.request.mockReset();
  hooks.request.mockResolvedValue(info());
});

describe('sync target selection', () => {
  it('checks the default current branch and disables only its sync actions', async () => {
    const tree = await inspect();
    expect(tree.find((element) => element.props.value === 'refs/heads/feature')?.props['data-checked']).toBe(true);
    for (const action of ['mergeTarget', 'rebaseTarget']) {
      expect(tree.find((element) => element.props.children === action)?.props.disabled).toBe(true);
    }
    expect(tree.find((element) => element.props.children === 'fetchRemotes')?.props.disabled).toBe(false);
    expect(hooks.request).toHaveBeenCalledTimes(1);
    expect(hooks.request).toHaveBeenCalledWith('ws', 'inspectSync', { item }, expect.any(AbortSignal));
  });

  it('keeps an explicit target through refresh and enables synchronization', async () => {
    const tree = await inspect();
    tree.find((element) => element.props.value === 'refs/heads/main')!.props.onSelect!();
    hooks.request.mockResolvedValue(info('refs/heads/main'));
    const selected = await inspect();
    expect(selected.find((element) => element.props.value === 'refs/heads/main')?.props['data-checked']).toBe(true);
    expect(selected.find((element) => element.props.children === 'mergeTarget')?.props.disabled).toBe(false);
    expect(selected.find((element) => element.props.children === 'rebaseTarget')?.props.disabled).toBe(false);
    selected.find((element) => element.props.children === 'refresh')!.props.onClick!();
    await inspect();
    expect(hooks.request).toHaveBeenLastCalledWith('ws', 'inspectSync', { item, targetRef: 'refs/heads/main' }, expect.any(AbortSignal));
  });

  it.each([
    ['refs/heads/feature', ''],
    ['refs/heads/main', 'main'],
  ])('uses the appropriate draft target for %s', (targetRef, expected) => {
    const tree = elements(WorktreeDraftForm({ workspaceId: 'ws', item, info: info(targetRef), disabled: false, onBusy: vi.fn(), onDone: vi.fn() }));
    const label = tree.find((element) => Array.isArray(element.props.children) && element.props.children[0] === 'draftTarget')!;
    expect(elements(label.props.children).find((element) => 'value' in element.props)?.props.value).toBe(expected);
  });
});
