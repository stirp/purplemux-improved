import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { createDesktopUpdatePreferences } from '../../../electron/app-update-preferences';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const setup = (port: number | null) => {
  const local = { readSkippedVersion: vi.fn(async () => '0.6.0'), saveSkippedVersion: vi.fn(async () => {}) };
  return { local, preferences: createDesktopUpdatePreferences(local, async () => port, '/isolated-config') };
};

describe('desktop update preference writer', () => {
  it('delegates writes to the local server, with no direct write or remote-server request', async () => {
    const { local, preferences } = setup(18022);
    vi.spyOn(fs, 'readFile').mockResolvedValue('test-token');
    const fetch = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    await preferences.saveSkippedVersion('0.7.0');
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:18022/api/app-update', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ action: 'skip-desktop-version', version: '0.7.0' }),
      headers: expect.objectContaining({ 'x-pmux-token': 'test-token', 'x-purplemux-update': '1' }),
    }));
    expect(local.saveSkippedVersion).not.toHaveBeenCalled();
    expect(await preferences.readSkippedVersion()).toBe('0.6.0');
  });
  it('does not fall back to direct writes if an existing server rejects or fails the request', async () => {
    const { local, preferences } = setup(18022);
    vi.spyOn(fs, 'readFile').mockResolvedValue('test-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: false }).mockRejectedValueOnce(new Error('offline')));
    await expect(preferences.saveSkippedVersion('0.7.0')).rejects.toThrow('local server');
    await expect(preferences.saveSkippedVersion('0.7.0')).rejects.toThrow('offline');
    expect(local.saveSkippedVersion).not.toHaveBeenCalled();
  });
  it('writes locally only when no local server or server lock exists', async () => {
    const { local, preferences } = setup(null);
    const access = vi.spyOn(fs, 'access').mockResolvedValueOnce();
    await expect(preferences.saveSkippedVersion('0.7.0')).rejects.toThrow('not ready');
    expect(local.saveSkippedVersion).not.toHaveBeenCalled();
    access.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }));
    await preferences.saveSkippedVersion('0.7.0');
    expect(local.saveSkippedVersion).toHaveBeenCalledExactlyOnceWith('0.7.0');
  });
});
