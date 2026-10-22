// @vitest-environment jsdom
import { act, createElement, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import GitCommitDialog from '@/components/features/workspace/git-commit-dialog';
import WorktreeDraftForm from '@/components/features/workspace/worktree-draft-form';
import type { IWorktreeSyncInfo } from '@/types/worktree';

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

it.each([false, true])('offers confirmed publication after a successful commit (main worktree: %s)', async (main) => {
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
    ahead: 1, behind: 0, operation: null, blockers: main ? ['main'] : [], review: null });
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
    expect(button('pushBranch').disabled).toBe(false);
    expect(request.mock.calls[0][1]).toBe('inspectSync');
    expect(request.mock.calls.some((args) => args[1] === 'pushBranch')).toBe(false);
    await act(async () => button('pushBranch').click());
    expect(container.textContent).toContain('pushConfirm');
    expect(request.mock.calls.some((args) => args[1] === 'pushBranch')).toBe(false);
    await act(async () => button('confirmAction').click());
    expect(request.mock.calls.some((args) => args[1] === 'pushBranch' && args[2].item.head === hash)).toBe(true);
    const draftTitle = container.querySelector('#worktree-draft-title')!;
    expect(draftTitle).toHaveProperty('value', 'Commit title');
    expect(button('finishPublish').disabled).toBe(false);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(draftTitle, 'Review title');
      draftTitle.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button('createDraft').disabled).toBe(false);
    await act(async () => button('createDraft').click());
    expect(container.textContent).toContain('draftConfirm');
    expect(request.mock.calls.some((args) => args[1] === 'createDraft')).toBe(false);
    request.mockResolvedValueOnce({ review: { url: 'https://github.com/example/repo/pull/1' }, existing: false });
    await act(async () => button('confirmAction').click());
    expect(request.mock.calls.some((args) => args[1] === 'createDraft' && args[2].item.head === hash)).toBe(true);
    expect(container.querySelector('a')?.href).toBe('https://github.com/example/repo/pull/1');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it.each(['clean', 'clean-main', 'dirty-main', 'operation-main', 'locked-main', 'missing-main', 'unknown-main', 'detached-main', 'different-branch', 'changed-after-overview'])('checks publication identity when there are no changes: %s', async (scenario) => {
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
    ahead: 1, behind: 0, operation: null,
    blockers: scenario.endsWith('-main') ? ['main', ...(scenario === 'clean-main' ? [] : [scenario.split('-')[0]])] : [], review: null });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(GitCommitDialog, {
      sessionName: 'pt-ws-one-pane-a-tab-b', repository, onClose: vi.fn(), onCommitted: vi.fn(),
    })));
    expect(container.textContent).toContain('cleanPublish');
    expect(container.textContent).not.toContain('adoptAndCommit');
    if (scenario === 'clean' || scenario.endsWith('-main')) {
      expect(container.textContent).toContain('pushBranch');
      expect(container.textContent).toContain('createDraft');
      const draftTitle = container.querySelector('#worktree-draft-title')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(draftTitle, 'Review title');
        draftTitle.dispatchEvent(new Event('input', { bubbles: true }));
      });
      for (const label of ['pushBranch', 'createDraft']) {
        expect([...container.querySelectorAll('button')].find((node) => node.textContent === label)?.disabled)
          .toBe(scenario !== 'clean' && scenario !== 'clean-main');
      }
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

const mountWorkflow = async (options: {
  commitError?: string; generateError?: boolean; pushError?: boolean; draftError?: boolean;
  noTarget?: boolean; noRemote?: boolean; mismatch?: boolean; blocker?: string; warning?: boolean;
  generation?: Promise<Response>;
  push?: Promise<unknown>;
} = {}) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const head = 'a'.repeat(40);
  const nextHead = 'b'.repeat(40);
  const preview = { snapshot: { directory: '/repo', branch: 'refs/heads/feature', head, tree: head }, files: ['file.txt'] };
  const events: string[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/git/commit') {
      const { action } = JSON.parse(init!.body as string);
      events.push(action);
      if (action === 'inspect') return Response.json(preview);
      if (action === 'generate') return options.generation ?? (options.generateError
        ? new Response('Gateway timeout', { status: 504 })
        : Response.json({ ...preview, title: 'AI title', body: 'AI body', truncated: false }));
      if (options.commitError) return Response.json({ error: options.commitError, code: options.commitError }, { status: 409 });
      return Response.json({ head: nextHead, output: '' });
    }
    return Response.json({ repositories: [{ id: '/repo/.git', worktrees: [{ directory: '/repo',
      branch: options.mismatch ? 'other' : 'feature', head: nextHead, workspaces: [{ id: 'ws-one' }] }] }] });
  });
  vi.stubGlobal('fetch', fetch);
  let pushFailed = false;
  let draftFailed = false;
  request.mockImplementation(async (_workspace, action) => {
    events.push(action);
    if (action === 'inspectSync') return { head: nextHead, branch: 'feature',
      targetRef: options.noTarget ? 'refs/heads/feature' : 'refs/heads/main',
      remotes: options.noRemote ? [] : [{ name: 'origin', repository: 'https://github.com/example/repo' },
        { name: 'backup', repository: 'https://gitlab.example.com/example/repo' }], blockers: options.blocker ? [options.blocker] : [], review: null };
    if (action === 'pushBranch') {
      if (options.pushError && !pushFailed) { pushFailed = true; throw Object.assign(new Error('push failed'), { code: 'pushFailed' }); }
      return options.push ?? { ok: true };
    }
    if (action === 'createDraft') {
      if (options.draftError && !draftFailed) { draftFailed = true; throw Object.assign(new Error('create failed'), { code: 'draftCreateFailed' }); }
      return { review: { url: 'https://github.com/example/repo/pull/1' }, existing: true,
        ...(options.warning ? { warning: 'draftAssociationFailed' } : {}) };
    }
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onCommitted = vi.fn();
  const onClose = vi.fn();
  await act(async () => root.render(createElement(StrictMode, null, createElement(GitCommitDialog, {
    sessionName: 'pt-ws-one-pane-a-tab-b', onClose, onCommitted,
  }))));
  const button = (label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === label)!;
  const edit = async (selector: string, value: string) => {
    await act(async () => {
      const input = container.querySelector(selector)!;
      const prototype = input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  return { container, button, edit, fetch, events, onCommitted, onClose,
    close: async () => { await act(async () => root.unmount()); container.remove(); } };
};

it.each(['empty', 'manual', 'body-only'])('completes all remaining steps and reuses the committed message: %s', async (mode) => {
  const ui = await mountWorkflow();
  try {
    if (mode === 'manual') await ui.edit('input', 'Manual title');
    if (mode !== 'empty') await ui.edit('textarea', 'Manual body');
    await act(async () => { ui.button(mode === 'manual' ? 'commitAndPublish' : 'generateCommitAndPublish').click(); });
    expect(ui.events.filter((event) => !['inspect', 'inspectSync'].includes(event))).toEqual([
      ...(mode === 'manual' ? [] : ['generate']), 'commit', 'pushBranch', 'createDraft',
    ]);
    const commit = ui.fetch.mock.calls.filter(([url]) => url === '/api/git/commit')
      .map(([, init]) => JSON.parse(init!.body as string)).find((call) => call.action === 'commit');
    const message = { title: mode === 'manual' ? 'Manual title' : 'AI title', body: mode === 'empty' ? 'AI body' : 'Manual body' };
    expect(commit.message).toEqual(message);
    expect(request.mock.calls.find((call) => call[1] === 'createDraft')?.[2]).toMatchObject({
      ...message, item: { head: 'b'.repeat(40) }, provider: 'github', remote: 'origin', targetBranch: 'main',
    });
    expect(ui.container.textContent).not.toContain('pushConfirm');
    expect(ui.container.textContent).not.toContain('draftConfirm');
    expect(ui.container.querySelector('a')?.href).toBe('https://github.com/example/repo/pull/1');
    expect(ui.onCommitted).toHaveBeenCalledTimes(1);
    expect(ui.button('close').disabled).toBe(false);
  } finally { await ui.close(); }
});

it.each(['generate', 'commitFailed', 'commitUnknown', 'changed'])('stops before publication when %s fails', async (failure) => {
  const ui = await mountWorkflow(failure === 'generate' ? { generateError: true } : { commitError: failure });
  try {
    await act(async () => ui.button('generateCommitAndPublish').click());
    expect(ui.events).not.toContain('pushBranch');
    expect(ui.events).not.toContain('createDraft');
    expect(ui.onCommitted).not.toHaveBeenCalled();
    expect(ui.button('close').disabled).toBe(false);
    if (failure === 'generate') expect(ui.events).not.toContain('commit');
    if (failure === 'commitUnknown' || failure === 'changed') expect(ui.button('commitAndPublish').disabled).toBe(true);
  } finally { await ui.close(); }
});

it.each(['push', 'draft'])('resumes only unfinished stages after a %s failure', async (failure) => {
  const ui = await mountWorkflow({ pushError: failure === 'push', draftError: failure === 'draft' });
  try {
    await ui.edit('input', 'Manual title');
    await ui.edit('textarea', 'Manual body');
    await act(async () => ui.button('commitAndPublish').click());
    expect(ui.container.querySelector('#worktree-draft-title')).toHaveProperty('value', 'Manual title');
    expect(ui.container.querySelector('textarea')).toHaveProperty('value', 'Manual body');
    expect(ui.events.filter((event) => event === 'createDraft')).toHaveLength(failure === 'push' ? 0 : 1);
    await act(async () => ui.button(failure === 'push' ? 'pushAndCreateDraft' : 'finishPublish').click());
    expect(ui.events.filter((event) => event === 'commit')).toHaveLength(1);
    expect(ui.events.filter((event) => event === 'pushBranch')).toHaveLength(failure === 'push' ? 2 : 1);
    expect(ui.events.filter((event) => event === 'createDraft')).toHaveLength(failure === 'push' ? 1 : 2);
    expect(ui.container.querySelector('a')).toBeTruthy();
  } finally { await ui.close(); }
});

it('queues publication during generation without generating or committing twice', async () => {
  let resolve!: (response: Response) => void;
  const ui = await mountWorkflow({ generation: new Promise((done) => { resolve = done; }) });
  try {
    await act(async () => ui.button('generate').click());
    await act(async () => { ui.button('publishAfterGeneration').click(); ui.button('publishAfterGeneration').click(); });
    expect(ui.button('publishQueued').disabled).toBe(true);
    expect(ui.button('close').disabled).toBe(true);
    await act(async () => resolve(Response.json({ snapshot: { directory: '/repo', branch: 'refs/heads/feature',
      head: 'a'.repeat(40), tree: 'a'.repeat(40) }, files: ['file.txt'], title: 'Queued title', body: 'Queued body' })));
    for (const action of ['generate', 'commit', 'pushBranch', 'createDraft']) expect(ui.events.filter((event) => event === action)).toHaveLength(1);
  } finally { await ui.close(); }
});

it.each(['noTarget', 'noRemote', 'mismatch', 'dirty'])('pauses publication safely for %s', async (condition) => {
  const ui = await mountWorkflow(condition === 'dirty' ? { blocker: 'dirty' } : { [condition]: true });
  try {
    await ui.edit('input', 'Manual title');
    await act(async () => ui.button('commitAndPublish').click());
    expect(ui.events).not.toContain('pushBranch');
    expect(ui.events).not.toContain('createDraft');
    expect(ui.button('close').disabled).toBe(false);
    if (condition === 'noTarget') {
      await ui.edit('input', 'main');
      await act(async () => ui.button('pushAndCreateDraft').click());
      expect(ui.events).toContain('createDraft');
    }
  } finally { await ui.close(); }
});

it('pushes the new remote after switching away from an already pushed destination', async () => {
  const ui = await mountWorkflow({ draftError: true });
  try {
    await ui.edit('input', 'Title');
    await act(async () => ui.button('commitAndPublish').click());
    await act(async () => {
      const select = ui.container.querySelector('select')!;
      select.value = 'backup'; select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => ui.button('pushAndCreateDraft').click());
    expect(request.mock.calls.filter((call) => call[1] === 'pushBranch').map((call) => call[2].remote)).toEqual(['origin', 'backup']);
    expect(request.mock.calls.filter((call) => call[1] === 'createDraft').at(-1)?.[2].provider).toBe('gitlab');
  } finally { await ui.close(); }
});

it('retains an existing review link and association warning after one-click publication', async () => {
  const ui = await mountWorkflow({ warning: true });
  try {
    await act(async () => ui.button('generateCommitAndPublish').click());
    expect(ui.container.textContent).toContain('draftExisting');
    expect(ui.container.textContent).toContain('reasons.draftAssociationFailed');
    expect(ui.container.querySelector('a')).toBeTruthy();
  } finally { await ui.close(); }
});

it('shows push progress, blocks closing and prevents duplicate publication while a push is pending', async () => {
  let resolve!: (value: unknown) => void;
  const ui = await mountWorkflow({ push: new Promise((done) => { resolve = done; }) });
  try {
    await ui.edit('input', 'Title');
    await act(async () => { ui.button('commitAndPublish').click(); ui.button('commitAndPublish').click(); });
    expect(ui.container.textContent).toContain('pushingBranch');
    expect(ui.button('close').disabled).toBe(true);
    expect(ui.container.querySelector('fieldset')?.disabled).toBe(true);
    await act(async () => { ui.button('pushAndCreateDraft').click(); ui.button('close').click(); });
    expect(ui.onClose).not.toHaveBeenCalled();
    expect(ui.events.filter((event) => event === 'pushBranch')).toHaveLength(1);
    expect(ui.events).not.toContain('createDraft');
    await act(async () => resolve({ ok: true }));
    expect(ui.events.filter((event) => event === 'createDraft')).toHaveLength(1);
    expect(ui.button('close').disabled).toBe(false);
  } finally { await ui.close(); }
});

it.each([false, true])('generates missing review text for existing commits and invalidates push state after HEAD changes (generation fails: %s)', async (fails) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const item = { repositoryId: '/repo/.git', directory: '/repo', head: 'a'.repeat(40), branch: 'feature' };
  const info: IWorktreeSyncInfo = { head: item.head, branch: item.branch, targetRef: 'refs/heads/main', targetHead: item.head,
    branches: [], remotes: [{ name: 'origin', repository: 'https://github.com/example/repo' }],
    ahead: 1, behind: 0, operation: null, blockers: ['main'], review: null };
  request.mockImplementation(async (_workspace, action) => {
    if (action === 'generateDraft') {
      if (fails) throw new Error('Generation failed');
      return { title: 'Existing commit title', body: 'Existing commit body' };
    }
    if (action === 'createDraft') throw new Error('Creation failed');
    return { ok: true };
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (head: string) => act(async () => root.render(createElement(WorktreeDraftForm, {
    workspaceId: 'ws-one', item: { ...item, head }, info: { ...info, head }, disabled: false, onBusy: vi.fn(), onDone: vi.fn(),
  })));
  const button = (label: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === label)!;
  try {
    await render(item.head);
    await act(async () => button('generateAndPublish').click());
    if (fails) {
      expect(request.mock.calls.map((call) => call[1])).toEqual(['generateDraft']);
      expect(button('generateAndPublish').disabled).toBe(false);
    } else {
      expect(request.mock.calls.map((call) => call[1])).toEqual(['generateDraft', 'pushBranch', 'createDraft']);
      expect(button('finishPublish')).toBeTruthy();
      expect(request.mock.calls.at(-1)?.[2]).toMatchObject({ title: 'Existing commit title', body: 'Existing commit body' });
      await render('b'.repeat(40));
      expect(button('pushAndCreateDraft')).toBeTruthy();
      await act(async () => button('pushAndCreateDraft').click());
      expect(request.mock.calls.filter((call) => call[1] === 'pushBranch').map((call) => call[2].item.head))
        .toEqual([item.head, 'b'.repeat(40)]);
      expect(request.mock.calls.filter((call) => call[1] === 'generateDraft')).toHaveLength(1);
    }
  } finally { await act(async () => root.unmount()); container.remove(); }
});
