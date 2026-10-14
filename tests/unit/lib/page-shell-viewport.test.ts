// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ mobile: false }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/hooks/use-sync', () => ({ default: () => {} }));
vi.mock('@/hooks/use-global-shortcuts', () => ({ default: () => {} }));
vi.mock('@/hooks/use-is-mobile', () => ({ default: () => state.mobile }));
vi.mock('@/hooks/use-is-mobile-device', () => ({ default: () => false }));
vi.mock('@/hooks/use-visual-viewport', () => ({ default: () => undefined }));
vi.mock('@/hooks/use-webview-store', () => ({ default: () => false }));
vi.mock('@/components/layout/sidebar', () => ({ default: () => null }));
vi.mock('@/components/features/mobile/mobile-layout', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));

import PageShell from '@/components/layout/page-shell';

afterEach(() => {
  document.documentElement.classList.remove('app-viewport-active');
  vi.unstubAllGlobals();
});

it.each([false, true])('scopes document scroll locking to the %s mobile page shell lifecycle', async (mobile) => {
  state.mobile = mobile;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(PageShell, null, createElement('span', null, 'workspace'))));
    expect(document.documentElement.classList.contains('app-viewport-active')).toBe(true);
  } finally {
    await act(async () => root.unmount());
    expect(document.documentElement.classList.contains('app-viewport-active')).toBe(false);
    container.remove();
  }
});
