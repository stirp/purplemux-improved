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
    expect(snapshot.installing).toBe(true);
    expect(manager.getState().phase).toBe('blocked');
    expect(manager.getState().installing).toBe(false);
    expect(deps.restart).not.toHaveBeenCalled();
  });
  it('installs the refreshed version once after an in-flight background check', async () => {
    const { deps, manager } = setup();
    await manager.check();
    const latest = deferred<string>();
    deps.latest.mockReturnValueOnce(latest.promise);
    const checking = manager.check();
    expect(manager.getState()).toMatchObject({ phase: 'checking', installing: false });
    const installation = manager.install();
    expect(manager.getState()).toMatchObject({ phase: 'checking', installing: true });
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
  it('forces a blocked update without either idle check and reuses downloaded files', async () => {
    const { deps, manager } = setup();
    await manager.check();
    deps.assertIdle.mockResolvedValueOnce().mockRejectedValue(new Error('long-lived session'));
    await manager.install();
    expect(manager.getState().phase).toBe('blocked');
    const checks = deps.assertIdle.mock.calls.length;
    await Promise.all([manager.install({ force: true, version: '0.6.0' }), manager.install({ force: true, version: '0.6.0' })]);
    expect(deps.assertIdle).toHaveBeenCalledTimes(checks);
    expect(deps.download).toHaveBeenCalledTimes(1);
    expect(deps.restart).toHaveBeenCalledTimes(1);
  });
  it('does not persist force authorization after a download failure', async () => {
    const { deps, manager } = setup();
    await manager.check();
    deps.download.mockRejectedValueOnce(new Error('offline'));
    deps.assertIdle.mockRejectedValue(new Error('busy'));
    await manager.install({ force: true, version: '0.6.0' });
    expect(deps.assertIdle).not.toHaveBeenCalled();
    expect(deps.restart).not.toHaveBeenCalled();
    await manager.install();
    expect(manager.getState().phase).toBe('blocked');
    expect(deps.assertIdle).toHaveBeenCalledTimes(1);
    expect(deps.download).toHaveBeenCalledTimes(1);
  });
  it('does not escalate a normal installation when a concurrent force request arrives', async () => {
    const { deps, manager } = setup();
    await manager.check();
    const idle = deferred<void>();
    deps.assertIdle.mockReturnValueOnce(idle.promise);
    const normal = manager.install();
    const forced = manager.install({ force: true, version: '0.6.0' });
    idle.reject(new Error('busy'));
    await Promise.all([normal, forced]);
    expect(manager.getState().phase).toBe('blocked');
    expect(deps.download).not.toHaveBeenCalled();
  });
  it('rejects force authorization for a version changed by an in-flight check', async () => {
    const { deps, manager } = setup();
    await manager.check();
    const latest = deferred<string>();
    deps.latest.mockReturnValueOnce(latest.promise);
    const checking = manager.check();
    const forced = manager.install({ force: true, version: '0.6.0' });
    latest.resolve('0.7.0');
    await Promise.all([checking, forced]);
    expect(manager.getState().phase).toBe('error');
    expect(deps.download).not.toHaveBeenCalled();
  });
  it.each([false, true])('does not force an unsupported or current version (supported=%s)', async (supported) => {
    const { deps } = setup();
    deps.latest.mockResolvedValue(supported ? '0.5.6' : '0.6.0');
    const manager = createAppUpdateManager({ ...deps, supported });
    await manager.check();
    await manager.install({ force: true, version: manager.getState().latestVersion! });
    expect(deps.download).not.toHaveBeenCalled();
    expect(deps.restart).not.toHaveBeenCalled();
  });
});

describe('skipped update versions', () => {
  const setupPreferences = () => {
    const { deps } = setup();
    let saved: string | null = null;
    const preferences = {
      readSkippedVersion: vi.fn(async () => saved),
      saveSkippedVersion: vi.fn(async (version: string) => { saved = version; }),
    };
    return { deps, preferences, manager: createAppUpdateManager({ ...deps, preferences }) };
  };
  it('persists an exact skipped version across managers without suppressing a later release or manual install', async () => {
    const { deps, preferences, manager } = setupPreferences();
    await manager.check();
    await manager.skip('0.6.0');
    expect(deps.download).not.toHaveBeenCalled();
    expect(manager.getState().skippedVersion).toBe('0.6.0');
    const restored = createAppUpdateManager({ ...deps, preferences });
    await restored.check();
    expect(restored.getState()).toMatchObject({ latestVersion: '0.6.0', skippedVersion: '0.6.0' });
    deps.latest.mockResolvedValueOnce('0.7.0');
    await restored.check();
    expect(restored.getState()).toMatchObject({ latestVersion: '0.7.0', skippedVersion: '0.6.0' });
    await restored.skip('0.7.0');
    await restored.install();
    expect(deps.download).toHaveBeenCalledExactlyOnceWith('0.7.0');
  });
  it('allows detection of newer releases after skipping a downloaded but blocked release', async () => {
    const { deps, manager } = setupPreferences();
    await manager.check();
    deps.assertIdle.mockResolvedValueOnce().mockRejectedValueOnce(new Error('busy'));
    await manager.install();
    await manager.skip('0.6.0');
    deps.latest.mockResolvedValue('0.7.0');
    await manager.check();
    await manager.install();
    expect(deps.download.mock.calls).toEqual([['0.6.0'], ['0.7.0']]);
  });
  it('rejects stale versions and skip requests while an install or check is running', async () => {
    const { deps, manager, preferences } = setupPreferences();
    await manager.check();
    for (const version of ['bad', '0.5.6', '0.7.0']) await expect(manager.skip(version)).rejects.toThrow('version');
    const latest = deferred<string>();
    deps.latest.mockReturnValueOnce(latest.promise);
    const checking = manager.check();
    await expect(manager.skip('0.6.0')).rejects.toThrow('already running');
    latest.resolve('0.6.0');
    await checking;
    const download = deferred<string>();
    deps.download.mockReturnValueOnce(download.promise);
    const installing = manager.install();
    await expect(manager.skip('0.6.0')).rejects.toThrow('already running');
    download.resolve('/staged');
    await installing;
    expect(preferences.saveSkippedVersion).not.toHaveBeenCalled();
  });
  it('preserves visibility when saving fails and serializes skip with other actions', async () => {
    const { deps, manager, preferences } = setupPreferences();
    await manager.check();
    const save = deferred<void>();
    preferences.saveSkippedVersion.mockReturnValueOnce(save.promise);
    const skipping = manager.skip('0.6.0');
    const installing = manager.install({ force: true, version: '0.6.0' });
    const checking = manager.check();
    const outcomes = Promise.allSettled([skipping, installing, checking]);
    save.reject(new Error('disk full'));
    expect((await outcomes).map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect(manager.getState().skippedVersion).toBeNull();
    expect(deps.download).not.toHaveBeenCalled();
    await manager.skip('0.6.0');
    expect(manager.getState().skippedVersion).toBe('0.6.0');
  });
  it('reports preference read failures without downloading', async () => {
    const { manager, deps, preferences } = setupPreferences();
    preferences.readSkippedVersion.mockRejectedValueOnce(new Error('unreadable preferences'));
    await manager.check();
    expect(manager.getState()).toMatchObject({ phase: 'error', error: 'unreadable preferences', skippedVersion: null });
    expect(deps.download).not.toHaveBeenCalled();
  });

});
