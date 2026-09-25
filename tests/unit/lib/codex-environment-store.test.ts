import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useConfigStore from '@/hooks/use-config-store';

beforeEach(() => {
  useConfigStore.getState().hydrate({});
});
afterEach(() => vi.unstubAllGlobals());

describe('saving Codex environment', () => {
  it('supports older configuration without the new field', async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    expect(useConfigStore.getState().codexEnvironment).toEqual({});
    const env = { HTTPS_PROXY: 'http://localhost:7890' };
    await useConfigStore.getState().setCodexEnvironment(env);
    expect(fetch).toHaveBeenCalledWith('/api/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codexEnvironment: env }),
    });
    expect(useConfigStore.getState().codexEnvironment).toEqual(env);
  });

  it.each([401, 400, 500])('reports HTTP %i and preserves saved values', async (status) => {
    const previous = { HTTPS_PROXY: 'previous' };
    useConfigStore.getState().hydrate({ codexEnvironment: previous });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status, json: async () => ({ error: 'Request failed' }),
    })));
    await expect(useConfigStore.getState().setCodexEnvironment({ HTTPS_PROXY: 'new' }))
      .rejects.toThrow(`HTTP ${status}: Request failed`);
    expect(useConfigStore.getState().codexEnvironment).toEqual(previous);
  });

  it('reports the status even if the server returns HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, json: async () => { throw new Error('Invalid JSON'); },
    })));
    await expect(useConfigStore.getState().setCodexEnvironment({})).rejects.toThrow('HTTP 500');
  });
});
