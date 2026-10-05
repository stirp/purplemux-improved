import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { buildRegionTypographyCSS, isValidRegionTypography, regionFontFamily, regionTypographyEqual } from '@/lib/region-typography';
import useConfigStore from '@/hooks/use-config-store';

const mocks = vi.hoisted(() => ({ getConfig: vi.fn(), updateConfig: vi.fn() }));
vi.mock('@/lib/config-store', () => ({ ...mocks, hashPassword: vi.fn(), generateSecret: vi.fn() }));
vi.mock('@/lib/access-filter', () => ({ isBoundToLocalhostOnly: () => true, updateAccessFromConfig: vi.fn() }));
import handler from '@/pages/api/config';

const settings = {
  sidebar: { fontFamily: 'Microsoft YaHei, sans-serif', fontSize: 15, color: '#aabbcc' },
  terminal: { fontFamily: 'JetBrains Mono', fontSize: 18, color: '#112233' },
};
async function call(body: unknown, method = 'PATCH') {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ body, method } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}
beforeEach(() => { vi.clearAllMocks(); useConfigStore.getState().hydrate({}); });
afterEach(() => vi.unstubAllGlobals());

describe('region typography configuration', () => {
  it('persists settings, exposes them on reload and restores defaults', async () => {
    expect((await call({ regionTypography: settings })).status).toHaveBeenCalledWith(200);
    expect(mocks.updateConfig).toHaveBeenCalledWith({ regionTypography: settings });
    mocks.getConfig.mockResolvedValue({ regionTypography: settings });
    expect((await call(undefined, 'GET')).json).toHaveBeenCalledWith(expect.objectContaining({ regionTypography: settings }));
    useConfigStore.getState().hydrate({ regionTypography: settings });
    expect(useConfigStore.getState().regionTypography).toEqual(settings);
    expect((await call({ regionTypography: {} })).status).toHaveBeenCalledWith(200);
    useConfigStore.getState().hydrate({ regionTypography: {} });
    expect(buildRegionTypographyCSS(useConfigStore.getState().regionTypography)).toBe('');
  });

  it.each([
    null, [], { unknown: {} }, { sidebar: null }, { sidebar: [] },
    { sidebar: { fontSize: 7 } }, { terminal: { fontSize: 41 } },
    { input: { fontSize: '16' } }, { messages: { fontSize: Infinity } },
    { tabs: { color: 'red' } }, { sidebar: { color: '#fff; }body{color:red' } },
    { terminal: { fontFamily: 'Mono; background:url(example)' } },
    { terminal: { fontFamily: 'Mono, ' } }, { terminal: { fontWeight: 700 } },
  ])('rejects malformed settings without changing persisted data: %j', async (regionTypography) => {
    expect(isValidRegionTypography(regionTypography)).toBe(false);
    expect((await call({ regionTypography })).status).toHaveBeenCalledWith(400);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });

  it('only changes client state after a successful save and retains edits on failure', async () => {
    const fetch = vi.fn(async () => ({ ok: true, json: async () => ({ config: { regionTypography: settings, updatedAt: '2026-10-05T00:00:02.000Z' } }) }));
    vi.stubGlobal('fetch', fetch);
    await useConfigStore.getState().setRegionTypography(settings);
    expect(fetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({ body: JSON.stringify({ regionTypography: settings }) }));
    expect(useConfigStore.getState().regionTypography).toEqual(settings);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Invalid region typography settings.' }) })));
    await expect(useConfigStore.getState().setRegionTypography({})).rejects.toThrow('Invalid region typography settings.');
    expect(useConfigStore.getState().regionTypography).toEqual(settings);
  });

  it('scopes overrides to selected regions and leaves terminal rendering to xterm', () => {
    const css = buildRegionTypographyCSS(settings);
    expect(css).toContain(':root{--region-sidebar-font-family:');
    expect(css).toContain('--region-sidebar-font-size:15px;');
    expect(css).toContain('--region-sidebar-color:#aabbcc;');
    expect(css).not.toContain('terminal');
    expect(css).not.toContain('tabs');
    expect(css).not.toContain('svg');
    expect(regionFontFamily('微软雅黑, JetBrains Mono, monospace')).toBe('"微软雅黑", "JetBrains Mono", monospace');
    expect(isValidRegionTypography({ messages: { fontFamily: '微软雅黑', fontSize: 8 }, tabs: { fontSize: 40 } })).toBe(true);
  });

  it('syncs changes from other clients, including resets, while retaining settings on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ regionTypography: settings }) })));
    await useConfigStore.getState().syncConfig();
    expect(useConfigStore.getState().regionTypography).toEqual(settings);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Offline'); }));
    await useConfigStore.getState().syncConfig();
    expect(useConfigStore.getState().regionTypography).toEqual(settings);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ regionTypography: {} }) })));
    await useConfigStore.getState().syncConfig();
    expect(useConfigStore.getState().regionTypography).toEqual({});
  });

  it('ignores region/field order and empty regions, and does not send equivalent PATCHes', async () => {
    const reordered = { terminal: { color: '#112233', fontSize: 18, fontFamily: 'JetBrains Mono' }, sidebar: { color: '#aabbcc', fontSize: 15, fontFamily: 'Microsoft YaHei, sans-serif' }, tabs: {} };
    expect(regionTypographyEqual(settings, reordered)).toBe(true);
    useConfigStore.getState().hydrate({ regionTypography: settings });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await useConfigStore.getState().setRegionTypography(reordered);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('lets the server reject invalid writes and preserves HTTP errors for non-JSON responses', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: 'Invalid region typography settings.' }) }));
    vi.stubGlobal('fetch', fetch);
    await expect(useConfigStore.getState().setRegionTypography({ input: { color: 'red' } })).rejects.toThrow('Invalid region typography settings.');
    expect(fetch).toHaveBeenCalledOnce();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json: async () => { throw new Error('HTML'); } })));
    await expect(useConfigStore.getState().setRegionTypography(settings)).rejects.toThrow('HTTP 503');
  });

  it('coalesces GETs and rejects stale responses after newer snapshots arrive', async () => {
    let resolveGet!: (value: unknown) => void;
    const fetch = vi.fn(() => new Promise((resolve) => { resolveGet = resolve; }));
    vi.stubGlobal('fetch', fetch);
    const first = useConfigStore.getState().syncConfig();
    const second = useConfigStore.getState().syncConfig();
    await Promise.resolve();
    expect(second).toBe(first);
    expect(fetch).toHaveBeenCalledOnce();
    useConfigStore.getState().hydrate({ regionTypography: settings, updatedAt: '2026-10-05T00:00:02.000Z' });
    resolveGet({ ok: true, json: async () => ({ regionTypography: {}, updatedAt: '2026-10-05T00:00:01.000Z' }) });
    await first;
    expect(useConfigStore.getState().regionTypography).toEqual(settings);
  });

  it('uses the saved snapshot so an older GET cannot roll back the save', async () => {
    let resolveGet!: (value: unknown) => void;
    const fetch = vi.fn()
      .mockImplementationOnce(() => new Promise((resolve) => { resolveGet = resolve; }))
      .mockResolvedValue({ ok: true, json: async () => ({ config: { regionTypography: settings, updatedAt: '2026-10-05T00:00:02.000Z' } }) });
    vi.stubGlobal('fetch', fetch);
    const sync = useConfigStore.getState().syncConfig();
    await Promise.resolve();
    await useConfigStore.getState().setRegionTypography(settings);
    resolveGet({ ok: true, json: async () => ({ regionTypography: {}, updatedAt: '2026-10-05T00:00:01.000Z' }) });
    await sync;
    expect(useConfigStore.getState().regionTypography).toEqual(settings);
  });

  it('hydrates every configuration field and preserves connection flags from initial loading', async () => {
    useConfigStore.getState().hydrate({ hostEnvLocked: true, bindHostIsLocal: true });
    const config = { appTheme: 'light', terminalTheme: { light: 'catppuccin-latte', dark: 'snazzy' }, locale: 'zh-CN', customCSS: ':root{--primary:red}', fontSize: 'large', regionTypography: settings, updatedAt: '2026-10-05T00:00:02.000Z' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => config })));
    await useConfigStore.getState().syncConfig();
    const { updatedAt: _, ...fields } = config;
    expect(useConfigStore.getState()).toMatchObject({ ...fields, hostEnvLocked: true, bindHostIsLocal: true });
    const oldState = useConfigStore.getState();
    useConfigStore.getState().hydrate({ ...config, locale: 'en', updatedAt: '2026-10-05T00:00:01.000Z' });
    expect(useConfigStore.getState()).toBe(oldState);
  });

  it('lets typography-only font changes adjust tab line boxes and removes overrides on reset', () => {
    for (const tabs of [{ fontSize: 40 }, { fontFamily: 'serif' }]) {
      const css = buildRegionTypographyCSS({ tabs });
      expect(css).toContain('--region-tabs-line-height:normal;');
      expect(css).not.toContain('height:auto');
      expect(css).not.toContain('!important');
      expect(css).not.toContain('[role=');
    }
    expect(buildRegionTypographyCSS({ tabs: { color: '#123456' } })).not.toContain('line-height');
    expect(buildRegionTypographyCSS({})).toBe('');
  });
});
