// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { LinuxStartupSettings } from '@/components/features/settings/linux-startup-settings';

const mocks = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast: mocks }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

let container: HTMLDivElement;
let root: Root;
let getStatus: ReturnType<typeof vi.fn>;
let setEnabled: ReturnType<typeof vi.fn>;
let canManage: ReturnType<typeof vi.fn>;
const setAPI = (api?: object) => Object.defineProperty(window, 'electronAPI', { configurable: true, value: api });
const render = async () => { await act(async () => { root.render(createElement(LinuxStartupSettings)); }); };
const toggle = () => container.querySelector<HTMLElement>('[role=switch]')!;
const input = () => container.querySelector<HTMLInputElement>('input[type=checkbox]')!;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks();
  vi.stubGlobal('PointerEvent', MouseEvent);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  getStatus = vi.fn().mockResolvedValue({ supported: true, enabled: false });
  canManage = vi.fn().mockResolvedValue(true);
  setEnabled = vi.fn().mockImplementation(async (enabled: boolean) => {
    getStatus.mockResolvedValue({ supported: true, enabled });
    return { supported: true, enabled };
  });
  setAPI({ platform: 'linux', canManageDesktopAutostart: canManage, getDesktopAutostartStatus: getStatus, setDesktopAutostartEnabled: setEnabled });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setAPI();
  vi.unstubAllGlobals();
});

it('hides in a browser, other platforms and older preloads', async () => {
  for (const api of [undefined, { platform: 'darwin' }, { platform: 'linux' },
    { platform: 'linux', getDesktopAutostartStatus: getStatus, setDesktopAutostartEnabled: setEnabled }]) {
    setAPI(api);
    await render();
    expect(container.textContent).toBe('');
  }
  expect(getStatus).not.toHaveBeenCalled();
});

it('hides in remote mode without requesting local startup state and refreshes mode on focus', async () => {
  canManage.mockResolvedValue(false);
  await render();
  expect(container.textContent).toBe('');
  expect(getStatus).not.toHaveBeenCalled();
  expect(setEnabled).not.toHaveBeenCalled();
  canManage.mockResolvedValue(true);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(toggle()).not.toBeNull();
  expect(getStatus).toHaveBeenCalledTimes(1);
  canManage.mockResolvedValue(false);
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(container.textContent).toBe('');
  expect(getStatus).toHaveBeenCalledTimes(1);
  expect(mocks.error).not.toHaveBeenCalled();
});

it('stays hidden until capability is confirmed and retries failed queries on focus', async () => {
  let rejectCapability: (error: Error) => void = () => {};
  canManage.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectCapability = reject; }));
  await render();
  expect(container.textContent).toBe('');
  expect(getStatus).not.toHaveBeenCalled();
  await act(async () => rejectCapability(new Error('IPC unavailable')));
  expect(container.textContent).toBe('');
  expect(getStatus).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(toggle()).not.toBeNull();
  expect(getStatus).toHaveBeenCalledTimes(1);
});

it('ignores stale status responses after switching away from local mode', async () => {
  let finishLoad: (value: object) => void = () => {};
  getStatus.mockReturnValueOnce(new Promise((resolve) => { finishLoad = resolve; }));
  await render();
  canManage.mockResolvedValue(false);
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => finishLoad({ supported: true, enabled: true }));
  expect(container.textContent).toBe('');
});

it('loads the OS state and toggles both ways', async () => {
  await render();
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  await act(async () => toggle().click());
  expect(setEnabled).toHaveBeenCalledWith(true);
  expect(toggle().getAttribute('aria-checked')).toBe('true');
  await act(async () => toggle().click());
  expect(setEnabled).toHaveBeenCalledWith(false);
  expect(toggle().getAttribute('aria-checked')).toBe('false');
});

it('locks while loading and saving, and preserves state on save failure', async () => {
  let finishLoad: (value: object) => void = () => {};
  getStatus.mockReturnValueOnce(new Promise((resolve) => { finishLoad = resolve; }));
  await render();
  expect(input().disabled).toBe(true);
  await act(async () => finishLoad({ supported: true, enabled: false }));
  let rejectSave: (error: Error) => void = () => {};
  setEnabled.mockReturnValueOnce(new Promise((_resolve, reject) => { rejectSave = reject; }));
  await act(async () => toggle().click());
  expect(input().disabled).toBe(true);
  await act(async () => toggle().click());
  expect(setEnabled).toHaveBeenCalledTimes(1);
  await act(async () => rejectSave(new Error('write failed')));
  expect(toggle().getAttribute('aria-checked')).toBe('false');
  expect(mocks.error).toHaveBeenCalledWith('saveFailed');
  expect(mocks.success).not.toHaveBeenCalled();
});

it('reports load failure and can retry', async () => {
  getStatus.mockRejectedValueOnce(new Error('IPC rejected'));
  await render();
  expect(container.querySelector('[role=alert]')?.textContent).toContain('loadFailed');
  expect(input().disabled).toBe(true);
  const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'retry')!;
  await act(async () => retry.click());
  expect(container.querySelector('[role=alert]')).toBeNull();
  expect(input().disabled).toBe(false);
});

it('refreshes external changes on focus and permits disabling an unsupported stale entry', async () => {
  await render();
  getStatus.mockResolvedValue({ supported: false, enabled: true, reason: 'stablePathRequired' });
  await act(async () => window.dispatchEvent(new Event('focus')));
  expect(toggle().getAttribute('aria-checked')).toBe('true');
  expect(input().disabled).toBe(false);
  expect(container.textContent).toContain('stablePathRequired');
  await act(async () => toggle().click());
  expect(setEnabled).toHaveBeenCalledWith(false);
});
