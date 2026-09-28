import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effect: () => undefined as void | (() => void) }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (index >= hooks.values.length) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => { hooks.values[index] = next; }];
  },
  useEffect: (effect: typeof hooks.effect) => { hooks.effect = effect; },
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import WorkspaceDeliveryButton from '@/components/features/workspace/workspace-delivery-button';
import WorktreeDeliveryDialog from '@/components/features/workspace/worktree-delivery-dialog';

type Element = ReactElement<{ children?: ReactNode; 'aria-label'?: string; onClick?: (event: { stopPropagation: () => void }) => void; item?: { directory: string } }>;
const elements = (node: ReactNode): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Element['props']>(node)) return [];
  return [node, ...elements(node.props.children)];
};
const render = () => {
  hooks.cursor = 0;
  return WorkspaceDeliveryButton({ workspaceId: 'ws-current' });
};
const open = () => {
  const event = { stopPropagation: vi.fn() };
  elements(render()).find((element) => element.props['aria-label'] === 'deliveryTitle')!.props.onClick!(event);
  expect(event.stopPropagation).toHaveBeenCalled();
  render();
  return hooks.effect();
};
const worktree = (directory: string, workspaceId = 'ws-current') => ({
  directory, head: 'head', branch: 'feature', missing: false,
  workspaces: [{ id: workspaceId }],
  status: { modified: 0, staged: 0, untracked: 0, ahead: 0, behind: 0 },
});
const fetchMock = vi.fn();
beforeEach(() => {
  hooks.values = []; hooks.cursor = 0;
  fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('workspace delivery entry', () => {
  it('always shows the entry without querying status while idle', () => {
    expect(elements(render()).some((element) => element.props['aria-label'] === 'deliveryTitle')).toBe(true);
    hooks.effect();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('queries on click and opens the current clean worktree, excluding other workspaces', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ repositories: [{ id: 'repo',
      worktrees: [worktree('/other', 'ws-other'), worktree('/current')],
    }], errors: [] }) });
    open();
    await vi.waitFor(() => {
      const dialog = elements(render()).find((element) => element.type === WorktreeDeliveryDialog);
      expect(dialog?.props.item?.directory).toBe('/current');
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/workspace/worktrees?workspaceId=ws-current');
  });

  it('shows an empty state for a workspace without repositories', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ repositories: [], errors: [] }) });
    open();
    await vi.waitFor(() => expect(elements(render()).some((element) => element.props.children === 'empty')).toBe(true));
  });

  it('aborts a pending query when the selection dialog closes', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    const cleanup = open();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    cleanup?.();
    expect(signal.aborted).toBe(true);
  });
});
