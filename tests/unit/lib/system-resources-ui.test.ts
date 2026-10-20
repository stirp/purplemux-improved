// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import useSystemResources from '@/hooks/use-system-resources';
import useConfigStore from '@/hooks/use-config-store';
import SystemResources from '@/components/layout/system-resources';
import header from '../../../messages/zh-CN/header.json';
import common from '../../../messages/zh-CN/common.json';

const fetchMock = vi.fn();
const metrics = { sampledAt: 1000, cpu: 93, memory: { used: 7 * 1024 ** 3, total: 8 * 1024 ** 3, available: 1024 ** 3, basis: 'available' } };
let root: Root, container: HTMLDivElement;
const Probe = ({ enabled = true }: { enabled?: boolean }) => {
  const state = useSystemResources(enabled);
  return createElement('output', null, JSON.stringify(state));
};
const response = () => ({ ok: true, json: async () => metrics });
const renderProbe = async (enabled = true) => act(async () => root.render(createElement(Probe, { enabled })));
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const visibility = async (hidden: boolean) => act(async () => {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
});

beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset().mockResolvedValue(response());
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  useConfigStore.setState({ systemResourcesEnabled: true });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe('resource polling lifecycle', () => {
  it('uses the server endpoint and polls every three seconds', async () => {
    await renderProbe();
    expect(fetchMock).toHaveBeenCalledWith('/api/system/resources', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
    expect(container.textContent).toContain('93');
    await advance(2999); expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not overlap requests and aborts timeouts before retrying', async () => {
    fetchMock.mockImplementationOnce((_url, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    await renderProbe(); await advance(4999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(container.textContent).toBe('{"resources":null,"error":true}');
    await advance(3000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain('93');
  });
  it('clears stale metrics on failures and recovers on the next successful read', async () => {
    await renderProbe();
    fetchMock.mockResolvedValueOnce({ ok: false });
    await advance(3000);
    expect(container.textContent).toBe('{"resources":null,"error":true}');
    await advance(3000); expect(container.textContent).toContain('93');
  });
  it('pauses while hidden and refreshes immediately on return', async () => {
    await renderProbe(); await visibility(true); await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await visibility(false); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not request when initially hidden or disabled', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    await renderProbe(); await advance(10_000); expect(fetchMock).not.toHaveBeenCalled();
    await renderProbe(false); await visibility(false); await advance(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('aborts pending requests when disabled and ignores late responses', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    fetchMock.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    await renderProbe(); const signal = fetchMock.mock.calls[0][1].signal;
    await renderProbe(false); expect(signal.aborted).toBe(true);
    await act(async () => resolve(response())); await advance(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('93');
  });
  it('aborts on unmount without scheduling more polls', async () => {
    fetchMock.mockImplementationOnce((_url, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    await renderProbe(); const signal = fetchMock.mock.calls[0][1].signal;
    await act(async () => root.render(null)); await advance(30_000);
    expect(signal.aborted).toBe(true); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

const renderMonitor = async (mobile: boolean) => {
  // eslint-disable-next-line react/no-children-prop -- createElement provider typing requires children.
  await act(async () => root.render(createElement(NextIntlClientProvider, { locale: 'zh-CN', timeZone: 'Asia/Shanghai', messages: { header, common }, children: createElement(SystemResources, { mobile }) })));
};

describe('resource entry and details', () => {
  it.each([true, false])('opens details with pressure labels and closes (mobile=%s)', async (mobile) => {
    await renderMonitor(mobile);
    const trigger = container.querySelector<HTMLButtonElement>('button')!;
    expect(trigger.textContent).toContain('93%'); expect(trigger.textContent).toContain('88%');
    await act(async () => trigger.click());
    expect(document.body.textContent).toContain('服务器资源');
    expect(document.body.textContent).toContain('偏高');
    expect(document.body.textContent).toContain('7.0 GiB');
    expect(document.body.textContent).toContain('8.0 GiB');
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await advance(500);
    expect(document.querySelector('[data-slot="sheet-content"], [data-slot="popover-content"]')).toBeNull();
  });
  it('hides the entry and stops polling when the setting is turned off', async () => {
    await renderMonitor(true);
    await act(async () => useConfigStore.setState({ systemResourcesEnabled: false }));
    expect(container.textContent).toBe(''); await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('defaults missing legacy configuration to on and preserves explicit false', () => {
    useConfigStore.getState().hydrate({}); expect(useConfigStore.getState().systemResourcesEnabled).toBe(true);
    useConfigStore.getState().hydrate({ systemResourcesEnabled: false }); expect(useConfigStore.getState().systemResourcesEnabled).toBe(false);
  });
});
