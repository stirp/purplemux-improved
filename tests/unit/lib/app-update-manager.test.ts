import { describe, expect, it, vi } from 'vitest';
import { createAppUpdateManager } from '@/lib/app-update-manager';
import { isNewerVersion, isStableVersion } from '@/lib/app-update-version';

const setup = () => {
  const deps = {
    currentVersion: '0.5.6', supported: true,
    latest: vi.fn(async () => '0.6.0'), assertIdle: vi.fn(async () => {}),
    download: vi.fn(async () => '/staged'), restart: vi.fn(async () => {}),
  };
  return { deps, manager: createAppUpdateManager(deps) };
};

describe('application updates', () => {
  it('only accepts numeric stable versions and compares components numerically', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    for (const version of ['0.5.6', '0.4.9', '1.0.0-beta.1', 'v1.0.0', '1.02.3', '1.2.3;cmd', '99999999999999999.0.0']) {
      expect(isNewerVersion(version, '0.5.6')).toBe(false);
    }
    expect(isStableVersion(null)).toBe(false);
  });
  it('checks without downloading and deduplicates concurrent checks', async () => {
    const { deps, manager } = setup();
    await Promise.all([manager.check(), manager.check()]);
    expect(deps.latest).toHaveBeenCalledTimes(1);
    expect(manager.getState()).toMatchObject({ phase: 'available', latestVersion: '0.6.0' });
    expect(deps.download).not.toHaveBeenCalled();
  });
  it.each(['0.5.6', '0.5.5'])('does not install the same or an older release %s', async (version) => {
    const { deps, manager } = setup();
    deps.latest.mockResolvedValue(version);
    await manager.check();
    expect(manager.getState().phase).toBe('idle');
    await manager.install();
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.restart).not.toHaveBeenCalled();
  });
  it('downloads and restarts exactly once for concurrent clicks', async () => {
    const { deps, manager } = setup();
    await manager.check();
    await Promise.all([manager.install(), manager.install()]);
    expect(deps.download).toHaveBeenCalledTimes(1);
    expect(deps.assertIdle).toHaveBeenCalledTimes(2);
    expect(deps.restart).toHaveBeenCalledWith('/staged');
    await manager.install();
    expect(deps.restart).toHaveBeenCalledTimes(1);
  });
  it('blocks before download when tasks are busy or unknown', async () => {
    const { deps, manager } = setup();
    await manager.check();
    deps.assertIdle.mockRejectedValue(new Error('busy'));
    await manager.install();
    expect(manager.getState().phase).toBe('blocked');
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.restart).not.toHaveBeenCalled();
  });
  it('rechecks after download and retains the package for an explicit retry', async () => {
    const { deps, manager } = setup();
    await manager.check();
    deps.assertIdle.mockResolvedValueOnce().mockRejectedValueOnce(new Error('busy'));
    await manager.install();
    expect(manager.getState().phase).toBe('blocked');
    expect(deps.restart).not.toHaveBeenCalled();
    await manager.check();
    expect(deps.latest).toHaveBeenCalledTimes(1);
    await manager.install();
    expect(deps.download).toHaveBeenCalledTimes(1);
    expect(deps.restart).toHaveBeenCalledTimes(1);
  });
  it('keeps the running server on download failure and allows retry', async () => {
    const { deps, manager } = setup();
    await manager.check();
    deps.download.mockRejectedValueOnce(new Error('disk full'));
    await manager.install();
    expect(manager.getState()).toMatchObject({ phase: 'error', error: 'disk full' });
    expect(deps.restart).not.toHaveBeenCalled();
    await manager.install();
    expect(deps.restart).toHaveBeenCalledTimes(1);
  });
  it('handles offline and invalid metadata without installing', async () => {
    const { deps, manager } = setup();
    deps.latest.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('bad');
    await manager.check();
    expect(manager.getState().error).toBe('offline');
    await manager.check();
    expect(manager.getState().phase).toBe('error');
    await manager.install();
    expect(deps.download).not.toHaveBeenCalled();
  });
  it('disables installation for unsupported launchers', async () => {
    const { deps } = setup();
    const manager = createAppUpdateManager({ ...deps, supported: false });
    await manager.check();
    await manager.install();
    expect(manager.getState().phase).toBe('error');
    expect(deps.download).not.toHaveBeenCalled();
  });
});
