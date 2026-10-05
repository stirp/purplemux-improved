// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import GitCommitDialog from '@/components/features/workspace/git-commit-dialog';

vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => Object.assign((key: string) => key, { has: () => true }) }));
vi.mock('@/components/ui/dialog', () => {
  const Box = ({ children }: { children: ReactNode }) => createElement('div', null, children);
  return { Dialog: Box, DialogContent: Box, DialogDescription: Box, DialogHeader: Box, DialogTitle: Box };
});

afterEach(() => vi.unstubAllGlobals());

it('preserves an edited draft and preview after generation times out, then allows manual retry', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const preview = { snapshot: { directory: '/repo', branch: 'refs/heads/main', head: 'a', tree: 'b' }, files: ['file.txt'] };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(preview))
    .mockResolvedValueOnce(new Response('<html>Gateway Timeout</html>', { status: 504 }))
    .mockResolvedValueOnce(Response.json({ ...preview, title: 'New title', body: 'New body', truncated: false }));
  vi.stubGlobal('fetch', fetch);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const button = (text: string) => [...container.querySelectorAll('button')].find((node) => node.textContent === text)!;
  try {
    await act(async () => root.render(createElement(GitCommitDialog, { sessionName: 'session', onClose: vi.fn(), onCommitted: vi.fn() })));
    const input = container.querySelector('input')!;
    const body = container.querySelector('textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Existing title');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(body, 'Existing body');
      body.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('generate').click());
    await act(async () => button('generate').click());
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('errors.generateTimeout');
    expect(input.value).toBe('Existing title');
    expect(body.value).toBe('Existing body');
    expect(button('adoptAndCommit').disabled).toBe(false);
    expect(button('close').disabled).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => button('generate').click());
    await act(async () => button('generate').click());
    expect(input.value).toBe('New title');
    expect(body.value).toBe('New body');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
