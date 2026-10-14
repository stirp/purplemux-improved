// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import GitCommitDialog from '@/components/features/workspace/git-commit-dialog';

const { request, workspaceState, translate } = vi.hoisted(() => ({
  request: vi.fn(), workspaceState: { workspaces: [{ id: 'ws-one', name: 'One' }] },
  translate: Object.assign((key: string) => key, { has: () => true }),
}));
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => translate }));
vi.mock('@/hooks/use-workspace-store', () => ({ default: (selector: (state: unknown) => unknown) => selector(workspaceState) }));
vi.mock('@/lib/worktree-action-client', () => ({ requestWorktreeAction: request }));
vi.mock('@/components/ui/dialog', () => {
  const Box = ({ children }: { children: ReactNode }) => createElement('div', null, children);
  return { Dialog: Box, DialogContent: Box, DialogDescription: Box, DialogHeader: Box, DialogTitle: Box };
});

afterEach(() => { request.mockReset(); vi.unstubAllGlobals(); });

it('offers confirmed branch publication after a successful local commit', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const hash = 'a'.repeat(40);
  const preview = { snapshot: { directory: '/repo', branch: 'refs/heads/feature', head: hash, tree: hash }, files: ['file.txt'] };
  const overview = { repositories: [{ id: '/repo/.git', worktrees: [{ directory: '/repo', head: hash, branch: 'feature',
    workspaces: [{ id: 'ws-one' }] }] }], errors: [] };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(preview)).mockResolvedValueOnce(Response.json({ head: hash, output: '' }))
    .mockImplementation(async () => Response.json(overview));
  vi.stubGlobal('fetch', fetch);
  request.mockResolvedValue({ head: hash, branch: 'feature', targetRef: 'refs/heads/main', targetHead: hash,
    branches: [], remotes: [{ name: 'origin', repository: 'https://github.com/example/repo' }],
    ahead: 1, behind: 0, operation: null, blockers: [], review: null });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const button = (text: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === text)!;
  try {
    await act(async () => root.render(createElement(GitCommitDialog, {
      sessionName: 'pt-ws-one-pane-a-tab-b', onClose: vi.fn(), onCommitted: vi.fn(),
    })));
    const input = container.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Commit title');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('adoptAndCommit').click());
    expect(container.textContent).toContain('deliveryNext');
    expect(button('pushBranch')).toBeTruthy();
    expect(request.mock.calls[0][1]).toBe('inspectSync');
    expect(request.mock.calls.some((args) => args[1] === 'pushBranch')).toBe(false);
    await act(async () => button('pushBranch').click());
    expect(container.textContent).toContain('pushConfirm');
    expect(request.mock.calls.some((args) => args[1] === 'pushBranch')).toBe(false);
    await act(async () => button('confirmAction').click());
    expect(request.mock.calls.some((args) => args[1] === 'pushBranch' && args[2].item.head === hash)).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each(['clean', 'different-branch', 'changed-after-overview'])('checks publication identity when there are no changes: %s', async (scenario) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const head = 'a'.repeat(40);
  const repository = { directory: '/repo', branch: 'feature', head };
  const overview = { repositories: [{ id: '/repo/.git', worktrees: [{ ...repository,
    branch: scenario === 'different-branch' ? 'other' : repository.branch, workspaces: [{ id: 'ws-one' }],
  }] }], errors: [] };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ code: 'noChanges', error: 'noChanges' }, { status: 409 }))
    .mockImplementation(async () => Response.json(overview));
  vi.stubGlobal('fetch', fetch);
  request.mockResolvedValue({ head: scenario === 'changed-after-overview' ? 'b'.repeat(40) : head,
    branch: 'feature', targetRef: 'refs/heads/main', targetHead: head, branches: [],
    remotes: [{ name: 'origin', repository: 'https://github.com/example/repo' }],
    ahead: 1, behind: 0, operation: null, blockers: [], review: null });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GitCommitDialog, {
      sessionName: 'pt-ws-one-pane-a-tab-b', repository, onClose: vi.fn(), onCommitted: vi.fn(),
    })));
    expect(container.textContent).toContain('cleanPublish');
    expect(container.textContent).not.toContain('adoptAndCommit');
    if (scenario === 'clean') {
      expect(container.textContent).toContain('pushBranch');
      expect(container.textContent).toContain('createDraft');
    } else {
      expect(container.textContent).toContain('deliveryUnavailable');
      expect(container.textContent).not.toContain('pushBranch');
    }
    expect(request.mock.calls.every((call) => call[1] === 'inspectSync')).toBe(true);
    expect(fetch.mock.calls.filter((call) => call[0] === '/api/git/commit').map((call) => JSON.parse(call[1].body).action)).toEqual(['inspect']);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('does not offer publication when the commit outcome is unknown, even with a captured repository', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const repository = { directory: '/repo', branch: 'feature', head: 'a'.repeat(40) };
  const preview = { snapshot: { ...repository, branch: 'refs/heads/feature', tree: repository.head }, files: ['file.txt'] };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(Response.json({ code: 'commitUnknown', error: 'Unknown outcome' }, { status: 504 }));
  vi.stubGlobal('fetch', fetch);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onCommitted = vi.fn();
  try {
    await act(async () => root.render(createElement(GitCommitDialog, {
      sessionName: 'pt-ws-one-pane-a-tab-b', repository, onClose: vi.fn(), onCommitted,
    })));
    const input = container.querySelector('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Commit title');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const commitButton = [...container.querySelectorAll('button')].find((node) => node.textContent === 'adoptAndCommit')!;
    await act(async () => commitButton.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('errors.commitUnknown');
    expect(commitButton.disabled).toBe(true);
    expect(container.textContent).not.toContain('cleanPublish');
    expect(container.textContent).not.toContain('pushBranch');
    expect(request).not.toHaveBeenCalled();
    expect(onCommitted).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
