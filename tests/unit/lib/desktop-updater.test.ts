import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import type { AppUpdater } from 'electron-updater';
import { createDesktopUpdater } from '../../../electron/app-updater';
import { createNativeUpdatePreparation } from '../../../electron/native-update-preparation';
import type { AutoUpdater } from 'electron';

describe('desktop update integration', () => {
  it('never installs on exit, checks automatically, and performs one-click install after idle checks', async () => {
    const updater = Object.assign(new EventEmitter(), {
      autoDownload: true, autoInstallOnAppQuit: true,
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.6.0' } })),
      downloadUpdate: vi.fn(async () => []),
    });
    const options = { version: '0.5.6', supported: true, assertIdle: vi.fn(async () => {}), restart: vi.fn(async () => {}) };
    const manager = createDesktopUpdater(updater as unknown as AppUpdater, options);
    await manager.check();
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    await manager.install();
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(options.assertIdle).toHaveBeenCalledTimes(2);
    expect(options.restart).toHaveBeenCalledTimes(1);
  });
  it('surfaces a missing release feed and does not restart', async () => {
    const updater = Object.assign(new EventEmitter(), { checkForUpdates: vi.fn(async () => { throw new Error('404 latest-mac.yml'); }) });
    const restart = vi.fn();
    const manager = createDesktopUpdater(updater as unknown as AppUpdater, { version: '0.5.6', supported: true, assertIdle: vi.fn(), restart });
    await manager.check();
    expect(manager.getState().error).toBe('404 latest-mac.yml');
    expect(restart).not.toHaveBeenCalled();
  });
  it('performs the final idle check before committing to native macOS preparation', async () => {
    const updater = Object.assign(new EventEmitter(), {
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.6.0' } })),
      downloadUpdate: vi.fn(async () => []),
    });
    const native = Object.assign(new EventEmitter(), { checkForUpdates: vi.fn() });
    const idle = vi.fn(async () => {});
    const restart = vi.fn(async () => {});
    const manager = createDesktopUpdater(updater as unknown as AppUpdater, {
      version: '0.5.6', supported: true, assertIdle: idle, restart,
      prepareNative: createNativeUpdatePreparation(native as unknown as AutoUpdater),
    });
    await manager.check();
    const operation = manager.install();
    await vi.waitFor(() => expect(native.checkForUpdates).toHaveBeenCalledTimes(1));
    expect(idle).toHaveBeenCalledTimes(2);
    expect(manager.getState().phase).toBe('restarting');
    expect(restart).not.toHaveBeenCalled();
    native.emit('update-downloaded');
    await operation;
    expect(idle).toHaveBeenCalledTimes(2);
    expect(restart).toHaveBeenCalledTimes(1);
    expect(native.listenerCount('error')).toBe(0);
  });
  it.each(['busy', 'unknown'])('does not leave an install-on-quit update when the post-download check is %s', async (reason) => {
    const idle = vi.fn(async () => {}).mockResolvedValueOnce().mockRejectedValueOnce(new Error(reason));
    const updater = Object.assign(new EventEmitter(), {
      checkForUpdates: vi.fn(async () => ({ updateInfo: { version: '0.6.0' } })),
      downloadUpdate: vi.fn(async () => []),
    });
    let installOnQuit = false;
    const native = Object.assign(new EventEmitter(), {
      checkForUpdates: vi.fn(() => {
        installOnQuit = true;
        native.emit('update-downloaded');
      }),
    });
    const ordinaryQuit = () => installOnQuit;
    const restart = vi.fn(async () => {});
    const manager = createDesktopUpdater(updater as unknown as AppUpdater, {
      version: '0.5.6', supported: true, assertIdle: idle, restart,
      prepareNative: createNativeUpdatePreparation(native as unknown as AutoUpdater),
    });
    await manager.check();
    await manager.install();
    expect(manager.getState().phase).toBe('blocked');
    expect(native.checkForUpdates).not.toHaveBeenCalled();
    expect(ordinaryQuit()).toBe(false);
    expect(restart).not.toHaveBeenCalled();
    await manager.check();
    expect(native.checkForUpdates).not.toHaveBeenCalled();
    await manager.install();
    expect(idle).toHaveBeenCalledTimes(4);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(native.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(restart).toHaveBeenCalledTimes(1);
  });
  it('preserves the app when native preparation fails and can retry', async () => {
    const native = Object.assign(new EventEmitter(), { checkForUpdates: vi.fn() });
    const prepare = createNativeUpdatePreparation(native as unknown as AutoUpdater);
    const operation = prepare('0.6.0');
    const rejected = expect(operation).rejects.toThrow('signature invalid');
    native.emit('error', new Error('signature invalid'));
    await rejected;
    expect(native.listenerCount('update-downloaded')).toBe(0);
    const retry = prepare('0.6.0');
    native.emit('update-downloaded');
    await retry;
    await prepare('0.6.0');
    expect(native.checkForUpdates).toHaveBeenCalledTimes(2);
  });
});
