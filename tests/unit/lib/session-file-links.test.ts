// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlanItem from '@/components/features/timeline/plan-item';
import AssistantMessageItem from '@/components/features/timeline/assistant-message-item';
import { EditorCwdContext } from '@/components/features/timeline/editor-file-link';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('next/router', () => ({ useRouter: () => ({ asPath: '/?mode=chat#session' }) }));
vi.mock('@/hooks/use-config-store', () => ({
  default: (selector: (state: unknown) => unknown) => selector({ editorPreset: 'vscode-remote', editorUrl: 'dev-box' }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('mobile file link interaction', () => {
  it('uses a native browser anchor without intercepting its default navigation', async () => {
    await act(async () => root.render(createElement(EditorCwdContext.Provider, { value: '/repo' },
      createElement(AssistantMessageItem, { entry: {
        id: 'message', type: 'assistant-message', timestamp: 0, markdown: '[Report](report.md:3)',
      } }),
    )));
    const anchor = container.querySelector('a')!;
    expect(anchor.getAttribute('href')).toBe('/file-preview?file=%2Frepo%2Freport.md&returnTo=%2F%3Fmode%3Dchat%23session&line=3');
    expect(anchor.target).toBe('_self');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('opens plan file links using the same session directory', async () => {
    await act(async () => root.render(createElement(EditorCwdContext.Provider, { value: '/repo/sub' },
      createElement(PlanItem, { entry: {
        id: 'plan', toolUseId: 'tool', type: 'plan', timestamp: 0,
        markdown: '# Plan\n\n[Report](../report.html)', status: 'success',
      } }),
    )));
    await act(async () => container.querySelector('button')!.click());
    const link = document.querySelector<HTMLAnchorElement>('[role="dialog"] a')!;
    expect(link.getAttribute('href')).toBe('/file-preview?file=%2Frepo%2Freport.html&returnTo=%2F%3Fmode%3Dchat%23session');
    expect(link.target).toBe('_self');
  });
});
