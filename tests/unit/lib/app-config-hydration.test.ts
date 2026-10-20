// @vitest-environment jsdom
import { act, createElement, type ComponentProps, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/pages/_app';
import useConfigStore from '@/hooks/use-config-store';
import SystemResources from '@/components/layout/system-resources';
import header from '../../../messages/en/header.json';
import common from '../../../messages/en/common.json';

const mocks = vi.hoisted(() => ({ workspaceHydrate: vi.fn() }));
vi.mock('@/hooks/use-workspace-store', () => ({ default: { getState: () => ({ hydrate: mocks.workspaceHydrate }) } }));
vi.mock('next/head', () => ({ default: () => null }));
vi.mock('next-themes', () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children, useTheme: () => ({ resolvedTheme: 'light' }) }));
vi.mock('sonner', () => ({ Toaster: () => null }));
vi.mock('@/components/layout/config-theme-sync', () => ({ default: () => null }));
vi.mock('@/hooks/use-terminal-theme', () => ({ default: () => ({ theme: { colors: { background: '#000', foreground: '#fff' } } }) }));
vi.mock('@/hooks/use-custom-style', () => ({ default: vi.fn() }));
vi.mock('@/hooks/use-agent-status', () => ({ default: vi.fn() }));
vi.mock('@/hooks/use-native-notification', () => ({ default: vi.fn() }));
vi.mock('@/hooks/use-toast-notification', () => ({ default: vi.fn() }));
vi.mock('@/hooks/use-web-push', () => ({ default: vi.fn() }));
vi.mock('@/hooks/use-is-mobile', () => ({ default: () => true }));

const messages = { header, common };
const Page = () => createElement(SystemResources, { mobile: true });
let root: Root, container: HTMLDivElement;
const fetchMock = vi.fn();
const render = async (props: Record<string, unknown>) => act(async () => root.render(createElement(App, {
  Component: Page, pageProps: { messages, ...props },
  router: {} as ComponentProps<typeof App>['router'],
})));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ sampledAt: 1000, cpu: 25, memory: { used: 4, total: 8, available: 4, basis: 'free' } }) });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  useConfigStore.getState().hydrate({});
  mocks.workspaceHydrate.mockClear();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('configuration hydration before rendering the monitor', () => {
  it('respects persisted false on a fresh page without initialWorkspace, with zero resource requests', async () => {
    expect(useConfigStore.getState().systemResourcesEnabled).toBe(true);
    await render({ initialConfig: { systemResourcesEnabled: false } });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(container.querySelector('button')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mocks.workspaceHydrate).not.toHaveBeenCalled();
  });
  it.each([{ systemResourcesEnabled: true }, {}])('preserves enabled and missing-setting defaults: %j', async (initialConfig) => {
    await render({ initialConfig });
    expect(container.querySelector('button')?.textContent).toContain('25%');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/system/resources');
  });
  it('still hydrates a later workspace without replaying an old configuration snapshot', async () => {
    await render({ initialConfig: { systemResourcesEnabled: false } });
    const initialWorkspace = { workspaces: [], activeWorkspaceId: null };
    await render({ initialWorkspace, initialConfig: { systemResourcesEnabled: true } });
    expect(mocks.workspaceHydrate).toHaveBeenCalledExactlyOnceWith(initialWorkspace);
    expect(useConfigStore.getState().systemResourcesEnabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('initializes configuration when arriving from a page without initial data', async () => {
    const Empty = () => null;
    await act(async () => root.render(createElement(App, { Component: Empty, pageProps: { messages }, router: {} as ComponentProps<typeof App>['router'] })));
    await render({ initialConfig: { systemResourcesEnabled: false } });
    expect(useConfigStore.getState().systemResourcesEnabled).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
