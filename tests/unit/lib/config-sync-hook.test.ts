// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import useSync from '@/hooks/use-sync';
import useConfigStore from '@/hooks/use-config-store';

vi.mock('@/hooks/use-workspace-store', () => ({ default: { getState: () => ({ syncWorkspaces: vi.fn(), activeWorkspaceId: null }) } }));
vi.mock('@/hooks/use-layout', () => ({ useLayoutStore: { getState: () => ({}) }, collectPanes: vi.fn() }));
vi.mock('@/hooks/use-tab-store', () => ({ default: {} }));
vi.mock('@/hooks/use-workspace-layout-store', () => ({ default: {} }));

afterEach(() => vi.unstubAllGlobals());
it('applies every field from config events without an extra GET and rejects old snapshots', async () => {
  let socket!: { onmessage?: (event: { data: string }) => void };
  vi.stubGlobal('WebSocket', class {
    constructor() { return Object.assign(socket = {}, { close: vi.fn() }); }
    onmessage?: (event: { data: string }) => void;
    close() {}
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  useConfigStore.getState().hydrate({});
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const Harness = () => { useSync(); return null; };
  try {
    await act(async () => root.render(createElement(Harness)));
    const config = { customCSS: 'body{}', fontSize: 'large', terminalTheme: { dark: 'snazzy', light: 'catppuccin-latte' }, appTheme: 'light', locale: 'zh-CN', updatedAt: '2026-10-05T00:00:02.000Z' };
    await act(async () => socket.onmessage!({ data: JSON.stringify({ type: 'config', config }) }));
    const { updatedAt: _, ...fields } = config;
    expect(useConfigStore.getState()).toMatchObject(fields);
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => socket.onmessage!({ data: JSON.stringify({ type: 'config', config: { ...config, locale: 'en', updatedAt: '2026-10-05T00:00:01.000Z' } }) }));
    expect(useConfigStore.getState().locale).toBe('zh-CN');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
