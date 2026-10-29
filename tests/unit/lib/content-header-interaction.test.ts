// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ContentHeader from '@/components/features/workspace/content-header';
import useConfigStore from '@/hooks/use-config-store';
import terminal from '../../../messages/zh-CN/terminal.json';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  useConfigStore.setState({ systemResourcesEnabled: false, editorPreset: 'off' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('preserves the focus chosen by split actions instead of bubbling to the old pane', async () => {
  let focusedPane = 'original';
  const onSplitPane = vi.fn(() => { focusedPane = 'new'; });
  const onToggleGitPanel = vi.fn();
  const onPaneClick = vi.fn(() => { focusedPane = 'original'; });
  // eslint-disable-next-line react/no-children-prop -- createElement provider typing requires children.
  await act(async () => root.render(createElement(NextIntlClientProvider, {
    locale: 'zh-CN', messages: { terminal },
    children: createElement('div', { onClick: onPaneClick }, createElement(ContentHeader, {
      inline: true,
      activePaneId: 'original',
      root: { type: 'pane', id: 'original', tabs: [], activeTabId: null },
      paneCount: 1, canSplit: true, isSplitting: false,
      onSplitPane, onEqualizeRatios: vi.fn(), isGitPanelOpen: false, onToggleGitPanel,
    })),
  })));

  await act(async () => container.querySelector<HTMLButtonElement>(`button[aria-label="${terminal.splitVertical}"]`)!.click());
  expect(onSplitPane).toHaveBeenCalledWith('original', 'horizontal');
  expect(focusedPane).toBe('new');
  expect(onPaneClick).not.toHaveBeenCalled();

  await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Toggle Git panel"]')!.click());
  expect(onToggleGitPanel).toHaveBeenCalledOnce();
  expect(onPaneClick).not.toHaveBeenCalled();
});
