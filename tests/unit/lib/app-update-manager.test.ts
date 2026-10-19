import { describe, expect, it, vi } from 'vitest';
import { createAppUpdateManager } from '@/lib/app-update-manager';
import { isNewerVersion, isStableVersion } from '@/lib/app-update-version';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

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
  it('publishes busy state synchronously while the first idle check is pending', async () => {
    const { deps, manager } = setup();
    await manager.check();
    const idle = deferred<void>();
    deps.assertIdle.mockReturnValueOnce(idle.promise);
    const installation = manager.install();
    const snapshot = manager.getState();
    expect(deps.download).not.toHaveBeenCalled();
    idle.reject(new Error('busy'));
    await installation;
    expect(snapshot.phase).toBe('checking');
    expect(manager.getState().phase).toBe('blocked');
    expect(deps.restart).not.toHaveBeenCalled();
  });
  it('installs the refreshed version once after an in-flight background check', async () => {
    const { deps, manager } = setup();
    await manager.check();
    const latest = deferred<string>();
    deps.latest.mockReturnValueOnce(latest.promise);
    const checking = manager.check();
    const installation = manager.install();
    const duplicate = manager.install();
    const anotherCheck = manager.check();
    expect(deps.assertIdle).not.toHaveBeenCalled();
    latest.resolve('0.7.0');
    await Promise.all([checking, installation, duplicate, anotherCheck]);
    expect(deps.latest).toHaveBeenCalledTimes(2);
    expect(deps.download).toHaveBeenCalledExactlyOnceWith('0.7.0');
    expect(deps.assertIdle).toHaveBeenCalledTimes(2);
    expect(deps.restart).toHaveBeenCalledExactlyOnceWith('/staged');
  });
  it.each(['offline', '0.5.6', '0.5.5'])('does not install stale metadata after a check returns %s', async (result) => {
    const { deps, manager } = setup();
    await manager.check();
    const latest = deferred<string>();
    deps.latest.mockReturnValueOnce(latest.promise);
    const checking = manager.check();
    const installation = manager.install();
    if (result === 'offline') latest.reject(new Error('offline'));
    else latest.resolve(result);
    await Promise.all([checking, installation]);
    expect(manager.getState().phase).toBe(result === 'offline' ? 'error' : 'idle');
    expect(deps.assertIdle).not.toHaveBeenCalled();
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.restart).not.toHaveBeenCalled();
    await manager.check();
    await manager.install();
    expect(deps.restart).toHaveBeenCalledTimes(1);
  });
  it('requires a new explicit click if installation after a background check is blocked', async () => {
    const { deps, manager } = setup();
    await manager.check();
    const latest = deferred<string>();
    deps.latest.mockReturnValueOnce(latest.promise);
    deps.assertIdle.mockRejectedValueOnce(new Error('busy'));
    const checking = manager.check();
    const installation = manager.install();
    latest.resolve('0.6.0');
    await Promise.all([checking, installation]);
    expect(manager.getState().phase).toBe('blocked');
    await manager.check();
    expect(deps.assertIdle).toHaveBeenCalledTimes(1);
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.restart).not.toHaveBeenCalled();
    await manager.install();
    expect(deps.restart).toHaveBeenCalledTimes(1);
  });
  it('does not run a background check during installation', async () => {
    const { deps, manager } = setup();
    await manager.check();
    const download = deferred<string>();
    deps.download.mockReturnValueOnce(download.promise);
    const installation = manager.install();
    await vi.waitFor(() => expect(deps.download).toHaveBeenCalledTimes(1));
    const checking = manager.check();
    download.resolve('/staged');
    await Promise.all([installation, checking]);
    expect(deps.latest).toHaveBeenCalledTimes(1);
    expect(deps.restart).toHaveBeenCalledTimes(1);
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
