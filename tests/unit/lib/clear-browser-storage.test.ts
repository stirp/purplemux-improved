import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBrowserStorage, reloadWithFreshPage } from '@/lib/clear-browser-storage';

beforeEach(() => {
  vi.stubGlobal('window', { location: { href: 'https://example.test/?workspace=one#pane', replace: vi.fn() } });
  vi.stubGlobal('navigator', {});
  vi.stubGlobal('localStorage', { clear: vi.fn() });
  vi.stubGlobal('sessionStorage', { clear: vi.fn() });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('browser storage cleanup', () => {
  it('clears local storage even on browsers without optional storage APIs', async () => {
    await clearBrowserStorage();
    expect(localStorage.clear).toHaveBeenCalledOnce();
    expect(sessionStorage.clear).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith('/api/browser-storage', expect.objectContaining({ method: 'POST', headers: { 'X-Purplemux-Clear-Storage': '1' } }));
    expect(window.location.replace).not.toHaveBeenCalled();
  });
  it('removes cache entries, worker registrations and enumerated databases before resolving', async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }] } });
    const cache = { keys: async () => ['push-nav', 'old-assets'], delete: vi.fn().mockResolvedValue(true) };
    vi.stubGlobal('caches', cache);
    Object.assign(window, { caches: cache });
    const request: Partial<IDBOpenDBRequest> = {};
    const idb = { databases: async () => [{ name: 'old-db' }], deleteDatabase: vi.fn(() => {
      setTimeout(() => request.onsuccess?.call(request as IDBOpenDBRequest, {} as Event), 0);
      return request;
    }) };
    vi.stubGlobal('indexedDB', idb);
    Object.assign(window, { indexedDB: idb });
    await clearBrowserStorage();
    expect(unregister).toHaveBeenCalledOnce();
    expect(cache.delete.mock.calls).toEqual([['push-nav'], ['old-assets']]);
    expect(idb.deleteDatabase).toHaveBeenCalledWith('old-db');
  });
  it('reports partial failure while still clearing other storage', async () => {
    vi.mocked(localStorage.clear).mockImplementation(() => { throw new Error('Denied'); });
    vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await expect(clearBrowserStorage()).rejects.toThrow('Some browser data');
    expect(sessionStorage.clear).toHaveBeenCalledOnce();
    expect(window.location.replace).not.toHaveBeenCalled();
  });
  it('does not hang when another tab holds an IndexedDB connection', async () => {
    const request: Partial<IDBOpenDBRequest> = {};
    const idb = { databases: async () => [{ name: 'locked-db' }], deleteDatabase: () => {
      setTimeout(() => request.onblocked?.call(request as IDBOpenDBRequest, {} as IDBVersionChangeEvent), 0);
      return request;
    } };
    vi.stubGlobal('indexedDB', idb);
    Object.assign(window, { indexedDB: idb });
    await expect(clearBrowserStorage()).rejects.toThrow('Some browser data');
    expect(sessionStorage.clear).toHaveBeenCalledOnce();
  });
  it('requests a new page URL without losing the current route or hash', () => {
    reloadWithFreshPage();
    const url = new URL(vi.mocked(window.location.replace).mock.calls[0][0]);
    expect(url.searchParams.get('workspace')).toBe('one');
    expect(url.searchParams.has('_refresh')).toBe(true);
    expect(url.hash).toBe('#pane');
  });
});
