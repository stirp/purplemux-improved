// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SWRConfig, type Cache } from 'swr';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppUpdateSettings from '@/components/features/settings/app-update-settings';
import { requestAppUpdate } from '@/hooks/use-app-update';
import type { IAppUpdateState } from '@/types/app-update';
import settings from '../../../messages/zh-CN/settings.json';

let root: Root;
let container: HTMLDivElement;
let cache: Cache;
let state: IAppUpdateState;
let saveError: boolean;
const actions: { action: string; version?: string }[] = [];
const render = async (compact = false) => {
  await act(async () => root.render(createElement(SWRConfig, {
    value: { provider: () => cache, dedupingInterval: 0, shouldRetryOnError: false },
  }, createElement(NextIntlClientProvider, { locale: 'zh-CN', messages: { settings } } as unknown as Parameters<typeof NextIntlClientProvider>[0], createElement(AppUpdateSettings, { compact })))));
};
const buttons = (label: string) => [...document.querySelectorAll('button')].filter((node) => node.textContent === label);
const click = async (label: string, index = 0) => { await act(async () => buttons(label)[index].click()); };
beforeEach(() => {
  state = { currentVersion: '0.5.9', latestVersion: '0.6.0', phase: 'available', supported: true, checkedAt: 1, progress: null, error: null, skippedVersion: null };
  saveError = false;
  actions.length = 0;
  cache = new Map();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async (_url: string, options?: RequestInit) => {
    if (options?.method === 'POST') {
      const action = JSON.parse(options.body as string);
      actions.push(action);
      if (action.action === 'skip') {
        if (saveError) return { ok: false, status: 409, json: async () => ({ error: 'disk full' }) };
        state = { ...state, skippedVersion: action.version, phase: 'available', error: null };
      }
    }
    return { ok: true, json: async () => ({ ...state }) };
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (window as unknown as { electronAPI?: unknown }).electronAPI;
  vi.unstubAllGlobals();
});

describe('update controls', () => {
  it('hides the skipped compact notice but keeps settings and manual upgrade available', async () => {
    await render(true);
    await click(settings.appUpdate.skip);
    expect(actions).toEqual([{ action: 'skip', version: '0.6.0' }]);
    expect(container.querySelector('section')).toBeNull();
    await render(false);
    expect(container.textContent).toContain('已跳过版本 0.6.0');
    await click(settings.appUpdate.install);
    expect(actions.at(-1)).toEqual({ action: 'install' });
  });
  it('shows a newer release even if an earlier one was skipped', async () => {
    state.skippedVersion = '0.5.10';
    await render(true);
    expect(buttons(settings.appUpdate.skip)).toHaveLength(1);
    expect(container.textContent).toContain('0.6.0');
  });
  it.each(['checking', 'available'] as const)('keeps the skipped notice hidden during background %s', async (phase) => {
    state.skippedVersion = state.latestVersion;
    state.phase = phase;
    state.installing = false;
    await render(true);
    expect(container.querySelector('section')).toBeNull();
    expect(actions).toEqual([]);
    await render(false);
    expect(container.textContent).toContain('已跳过版本 0.6.0');
  });
  it.each(['checking', 'downloading', 'ready', 'restarting'] as const)('shows explicit installation progress for a skipped version during %s', async (phase) => {
    state.skippedVersion = state.latestVersion;
    state.phase = phase;
    state.installing = true;
    await render(true);
    expect(container.querySelector('section')).not.toBeNull();
    expect([...container.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  });
  it.each(['error', 'blocked'] as const)('keeps a skipped version visible when the update is %s', async (phase) => {
    state.skippedVersion = state.latestVersion;
    state.phase = phase;
    state.error = 'update failed';
    await render(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });
  it('requires confirmation for force, cancels without installing, and sends the displayed version', async () => {
    state.phase = 'blocked'; state.error = 'busy';
    await render();
    await click(settings.appUpdate.forceInstall);
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('运行中的任务可能中断');
    expect(actions).toEqual([]);
    await click(settings.appUpdate.cancel);
    expect(actions).toEqual([]);
    await click(settings.appUpdate.forceInstall);
    await click(settings.appUpdate.forceInstall, 1);
    expect(actions).toEqual([{ action: 'force-install', version: '0.6.0' }]);
  });
  it('shows skip save errors even when the original state is blocked', async () => {
    saveError = true; state.phase = 'blocked'; state.error = 'busy';
    await render(true);
    await click(settings.appUpdate.skip);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('disk full');
    expect(buttons(settings.appUpdate.skip)).toHaveLength(1);
  });
  it.each(['checking', 'downloading', 'restarting'] as const)('disables all actions during %s', async (phase) => {
    state.phase = phase;
    await render();
    expect([...container.querySelectorAll('button')].every((button) => button.disabled)).toBe(true);
  });
  it.each([false, true])('keeps actions disabled during the final idle check (compact=%s)', async (compact) => {
    state.phase = 'ready';
    state.installing = true;
    await render(compact);
    const controls = [...container.querySelectorAll('button')];
    expect(controls).toHaveLength(compact ? 3 : 4);
    expect(controls.every((button) => button.disabled)).toBe(true);
    await act(async () => { controls.forEach((button) => button.click()); });
    expect(actions).toEqual([]);
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });
  it.each([false, true])('allows actions after installation is blocked (compact=%s)', async (compact) => {
    state.phase = 'blocked';
    state.installing = false;
    state.error = 'busy';
    await render(compact);
    const controls = [...container.querySelectorAll('button')];
    expect(controls).toHaveLength(compact ? 3 : 4);
    expect(controls.every((button) => !button.disabled)).toBe(true);
    await click(settings.appUpdate.forceInstall);
    await click(settings.appUpdate.forceInstall, 1);
    expect(actions).toEqual([{ action: 'force-install', version: '0.6.0' }]);
  });
  it('routes new actions only through the desktop bridge in Electron', async () => {
    const appUpdateAction = vi.fn(async () => state);
    (window as unknown as { electronAPI: unknown }).electronAPI = { isElectron: true, getAppUpdate: async () => state, appUpdateAction };
    await requestAppUpdate('force-install', '0.6.0');
    await requestAppUpdate('skip', '0.6.0');
    expect(appUpdateAction.mock.calls).toEqual([['force-install', '0.6.0'], ['skip', '0.6.0']]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
