// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import WorktreeTreeDialog from '@/components/features/workspace/worktree-tree-dialog';

const { state, request, translate } = vi.hoisted(() => ({
  state: { workspaces: [
    { id: 'ws-parent', name: 'Parent', directories: ['/parent'] },
    { id: 'ws-child', name: 'Child', parentWorkspaceId: 'ws-parent', directories: ['/child'] },
  ] },
  request: vi.fn(),
  translate: (key: string, values?: Record<string, string>) => `${key}${values ? JSON.stringify(values) : ''}`,
}));
vi.mock('next-intl', () => ({ useTranslations: () => translate }));
vi.mock('@/hooks/use-workspace-store', () => ({ default: (selector: (value: unknown) => unknown) => selector(state) }));
vi.mock('@/lib/worktree-action-client', () => ({ requestWorktreeAction: request }));
vi.mock('@/components/features/workspace/manage-worktrees-dialog', () => ({ default: () => null }));
vi.mock('@/components/ui/dialog', () => {
  const Box = ({ children }: { children: ReactNode }) => createElement('div', null, children);
  return { Dialog: Box, DialogContent: Box, DialogDescription: Box, DialogHeader: Box, DialogTitle: Box };
});

const parentHead = 'a'.repeat(40);
const childHead = 'b'.repeat(40);
const overview = { repositories: [{ id: '/repo/.git', worktrees: [
  { directory: '/parent', head: parentHead, branch: 'main', workspaces: [{ id: 'ws-parent' }] },
  { directory: '/child', head: childHead, branch: 'feature', workspaces: [{ id: 'ws-child' }] },
] }], errors: [] };

afterEach(() => { request.mockReset(); vi.unstubAllGlobals(); });

it.each(['mergeIntoParent', 'mergeIntoChild'])('expands %s confirmation inside the selected relationship after refresh and cancellation', async (label) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const originalWorkspaces = state.workspaces;
  state.workspaces = [...originalWorkspaces,
    { id: 'ws-sibling', name: 'Sibling', parentWorkspaceId: 'ws-parent', directories: ['/sibling'] },
    { id: 'ws-nested', name: 'Nested', parentWorkspaceId: 'ws-sibling', directories: ['/nested'] },
  ];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({
    ...overview, repositories: [{ ...overview.repositories[0], worktrees: [
      ...overview.repositories[0].worktrees,
      { directory: '/sibling', head: childHead, branch: 'sibling', workspaces: [{ id: 'ws-sibling' }] },
      { directory: '/nested', head: childHead, branch: 'nested', workspaces: [{ id: 'ws-nested' }] },
    ] }],
  })));
  request.mockResolvedValue({ ahead: 1, behind: 1, blockers: [], operation: null });
  const container = document.createElement('div');
  const root = createRoot(container);
  const buttons = (text: string) => [...container.querySelectorAll('button')].filter((node) => node.textContent === text);
  const card = (index: number) => buttons(label)[index].parentElement!.parentElement!;
  try {
    await act(async () => root.render(createElement(WorktreeTreeDialog, {
      root: state.workspaces[0], onClose: vi.fn(), onSelect: vi.fn(),
    })));
    expect(buttons(label)).toHaveLength(3);
    await act(async () => buttons(label)[2].click());
    const confirmation = buttons('merge')[0].parentElement!.parentElement!;
    expect(confirmation.parentElement).toBe(card(2));
    expect(buttons(label)[2].compareDocumentPosition(confirmation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(confirmation.textContent).toContain(`confirm${JSON.stringify(label === 'mergeIntoParent'
      ? { source: 'Nested', destination: 'Sibling' }
      : { source: 'Sibling', destination: 'Nested' })}`);
    expect(buttons('merge')).toHaveLength(1);
    expect(buttons(label).every((node) => node.disabled)).toBe(true);
    expect(request.mock.calls.every((call) => call[1] === 'inspectSync')).toBe(true);

    await act(async () => buttons('refresh')[0].click());
    expect(buttons('merge')[0].parentElement!.parentElement!.parentElement).toBe(card(2));
    expect(buttons('merge')).toHaveLength(1);
    await act(async () => buttons('cancel')[0].click());
    expect(buttons('merge')).toHaveLength(0);
    expect(buttons(label).every((node) => !node.disabled)).toBe(true);
    expect(request.mock.calls.every((call) => call[1] === 'inspectSync')).toBe(true);

    await act(async () => buttons(label)[0].click());
    expect(buttons('merge')[0].parentElement!.parentElement!.parentElement).toBe(card(0));
    expect(buttons('merge')).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    state.workspaces = originalWorkspaces;
  }
});

it.each(['deleted', 'reparented', 'deleted-refresh-failed'])('clears confirmation when its relationship is %s', async (scenario) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const originalWorkspaces = state.workspaces;
  const workspaces = [...originalWorkspaces,
    { id: 'ws-sibling', name: 'Sibling', parentWorkspaceId: 'ws-parent', directories: ['/sibling'] },
  ];
  state.workspaces = workspaces;
  const fetch = vi.fn().mockImplementation(async () => Response.json({
    ...overview, repositories: [{ ...overview.repositories[0], worktrees: [
      ...overview.repositories[0].worktrees,
      { directory: '/sibling', head: childHead, branch: 'sibling', workspaces: [{ id: 'ws-sibling' }] },
    ] }],
  }));
  vi.stubGlobal('fetch', fetch);
  request.mockResolvedValue({ ahead: 1, behind: 1, blockers: [], operation: null });
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = () => root.render(createElement(WorktreeTreeDialog, {
    root: workspaces[0], onClose: vi.fn(), onSelect: vi.fn(),
  }));
  const buttons = (label: string) => [...container.querySelectorAll('button')].filter((node) => node.textContent === label);
  try {
    await act(async () => render());
    await act(async () => buttons('mergeIntoChild')[0].click());
    expect(buttons('merge')).toHaveLength(1);
    await act(async () => buttons('title')[0].click());
    await act(async () => buttons('relationships')[0].click());
    expect(buttons('merge')).toHaveLength(1);
    await act(async () => buttons('title')[0].click());

    state.workspaces = scenario === 'reparented'
      ? workspaces.map((workspace) => workspace.id === 'ws-child' ? { ...workspace, parentWorkspaceId: 'ws-sibling' } : workspace)
      : workspaces.filter((workspace) => workspace.id !== 'ws-child');
    if (scenario === 'deleted-refresh-failed') {
      fetch.mockResolvedValueOnce(Response.json({ error: 'Overview unavailable' }, { status: 503 }));
    }
    await act(async () => render());
    await act(async () => buttons('relationships')[0].click());
    expect(buttons('merge')).toHaveLength(0);
    expect(buttons('mergeIntoChild').length).toBeGreaterThan(0);
    expect(buttons('mergeIntoChild').every((node) => !node.disabled)).toBe(true);
    if (scenario === 'deleted-refresh-failed') expect(container.textContent).toContain('Overview unavailable');

    state.workspaces = workspaces;
    await act(async () => render());
    expect(buttons('merge')).toHaveLength(0);
    await act(async () => buttons('mergeIntoChild')[1].click());
    expect(container.textContent).toContain('confirm{"source":"Parent","destination":"Sibling"}');
    expect(request.mock.calls.every((call) => call[1] === 'inspectSync')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    state.workspaces = originalWorkspaces;
  }
});

it.each([
  ['mergeIntoParent', '/parent', 'refs/heads/feature', childHead, 'Child', 'Parent'],
  ['mergeIntoChild', '/child', 'refs/heads/main', parentHead, 'Parent', 'Child'],
  ['mergeIntoParent', '/parent', 'refs/heads/feature', childHead, 'Child', 'Parent', 'multi-repository'],
  ['mergeIntoChild', '/child', 'refs/heads/main', parentHead, 'Parent', 'Child', 'multi-repository'],
])('executes %s in the confirmed destination (case %#)', async (label, directory, targetRef, targetHead, sourceName, destinationName, scenario = '') => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const data = { ...overview, repositories: [
    ...(scenario ? [{ id: '/other/.git', worktrees: [
      { directory: '/other', head: 'c'.repeat(40), branch: 'other-main', workspaces: [{ id: 'ws-parent' }] },
    ] }] : []),
    ...overview.repositories,
  ] };
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json(data)));
  request.mockImplementation(async (_workspaceId: string, action: string, payload: { item: { directory: string } }) => {
    if (action === 'merge') return { ok: true, output: '', operation: null };
    return { head: payload.item.directory === '/child' ? childHead : parentHead, branch: payload.item.directory === '/child' ? 'feature' : 'main',
      targetRef, targetHead: payload.item.directory === '/child' ? parentHead : childHead,
      ahead: 1, behind: 1, blockers: payload.item.directory === '/parent' ? ['main'] : [], operation: null,
      branches: [], remotes: [], review: null };
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const button = (text: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === text)!;
  try {
    await act(async () => root.render(createElement(WorktreeTreeDialog, {
      root: state.workspaces[0], onClose: vi.fn(), onSelect: vi.fn(),
    })));
    expect(container.textContent).toContain('childAhead{"count":1}');
    expect(container.textContent).toContain('parentAhead{"count":1}');
    expect(request.mock.calls[0]?.[2]).toMatchObject({ item: { repositoryId: '/repo/.git', directory: '/child' }, targetRef: 'refs/heads/main' });
    expect(container.textContent).toContain(label);
    await act(async () => button(label).click());
    expect(container.textContent).toContain(`confirm${JSON.stringify({ source: sourceName, destination: destinationName })}`);
    await act(async () => button('merge').click());
    const call = request.mock.calls.find((args) => args[1] === 'merge');
    expect(call?.[2]).toMatchObject({ item: { repositoryId: '/repo/.git', directory }, targetRef, targetHead });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('does not match a parent from another repository', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => Response.json({ repositories: [
    { id: '/parent/.git', worktrees: [overview.repositories[0].worktrees[0]] },
    { id: '/child/.git', worktrees: [overview.repositories[0].worktrees[1]] },
  ], errors: [] })));
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(WorktreeTreeDialog, {
      root: state.workspaces[0], onClose: vi.fn(), onSelect: vi.fn(),
    })));
    expect(container.textContent).toContain('unavailable');
    expect(container.textContent).not.toContain('mergeIntoParent');
    expect(request).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
  }
});

it.each(['main-conflict', 'rejected-request'])('keeps %s visible across refreshes and clears it on the next merge', async (scenario) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetch = vi.fn().mockImplementation(async () => Response.json(overview));
  vi.stubGlobal('fetch', fetch);
  const failure = scenario === 'main-conflict' ? 'CONFLICT in file.txt' : 'Merge request failed';
  request.mockImplementation(async (_workspaceId: string, action: string, payload: { item: { directory: string } }) => {
    if (action === 'merge') {
      if (scenario === 'rejected-request') throw new Error(failure);
      return { ok: false, output: failure, operation: 'merge' };
    }
    return { targetHead: payload.item.directory === '/child' ? parentHead : childHead,
      ahead: 1, behind: 1, blockers: payload.item.directory === '/parent' ? ['main'] : [], operation: null };
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const button = (label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === label)!;
  const alerts = () => [...container.querySelectorAll('[role="alert"]')].map((node) => node.textContent).join('\n');
  try {
    await act(async () => root.render(createElement(WorktreeTreeDialog, {
      root: state.workspaces[0], onClose: vi.fn(), onSelect: vi.fn(),
    })));
    await act(async () => button('mergeIntoParent').click());
    await act(async () => button('merge').click());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(alerts()).toContain(failure);
    if (scenario === 'main-conflict') expect(alerts()).toContain('mainRecovery');

    fetch.mockResolvedValueOnce(Response.json({ error: 'Overview unavailable' }, { status: 503 }));
    await act(async () => button('refresh').click());
    expect(alerts()).toContain('Overview unavailable');
    expect(alerts()).toContain(failure);
    await act(async () => button('refresh').click());
    expect(alerts()).not.toContain('Overview unavailable');
    expect(alerts()).toContain(failure);
    if (scenario === 'main-conflict') expect(alerts()).toContain('mainRecovery');

    await act(async () => button('mergeIntoParent').click());
    request.mockResolvedValueOnce({ blockers: [], operation: null, targetHead: childHead })
      .mockResolvedValueOnce({ ok: true, output: '', operation: null });
    await act(async () => button('merge').click());
    expect(alerts()).toBe('');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
