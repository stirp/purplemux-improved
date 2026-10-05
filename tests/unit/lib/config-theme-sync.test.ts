// @vitest-environment jsdom
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import ConfigThemeSync from '@/components/layout/config-theme-sync';
import useTerminalTheme from '@/hooks/use-terminal-theme';
import useConfigStore from '@/hooks/use-config-store';

const mocks = vi.hoisted(() => ({ setTheme: vi.fn() }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark', setTheme: mocks.setTheme }) }));

it('updates application and terminal themes after remote configuration hydration', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useConfigStore.getState().hydrate({});
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const TerminalTheme = () => createElement('span', null, useTerminalTheme().theme.id);
  try {
    await act(async () => root.render(createElement(Fragment, null, createElement(ConfigThemeSync), createElement(TerminalTheme))));
    await act(async () => useConfigStore.getState().hydrate({ appTheme: 'light', terminalTheme: { dark: 'dracula', light: 'github-light' }, updatedAt: '2026-10-05T00:00:01.000Z' }));
    expect(mocks.setTheme).toHaveBeenLastCalledWith('light');
    expect(container.textContent).toBe('dracula');
    await act(async () => useConfigStore.getState().hydrate({ appTheme: 'dark', terminalTheme: { dark: 'nord', light: 'github-light' }, updatedAt: '2026-10-05T00:00:02.000Z' }));
    expect(mocks.setTheme).toHaveBeenLastCalledWith('dark');
    expect(container.textContent).toBe('nord');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
