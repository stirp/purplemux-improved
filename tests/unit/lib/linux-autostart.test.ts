import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { buildDesktopEntry, createDesktopAutostart, isLocalStartupFrame, waitForLinuxBackgroundServer } from '../../../electron/linux-autostart';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pmux-desktop-startup-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); vi.useRealTimers(); });
const manager = (options = {}) => createDesktopAutostart({
  platform: 'linux', packaged: true, homeDir: directory, executable: process.execPath, ...options,
});

describe('Linux desktop autostart', () => {
  it('defaults off, enables, survives re-read and disables idempotently', () => {
    expect(manager().getStatus()).toEqual({ supported: true, enabled: false });
    expect(manager().setEnabled(true).enabled).toBe(true);
    expect(manager().getStatus().enabled).toBe(true);
    expect(manager().setEnabled(false).enabled).toBe(false);
    expect(manager().setEnabled(false).enabled).toBe(false);
  });

  it('uses an absolute XDG directory and AppImage path instead of temporary mount', () => {
    const configHome = path.join(directory, 'xdg');
    const startup = manager({ configHome, executable: '/tmp/.mount_123/bin/app', appImage: process.execPath });
    expect(startup.setEnabled(true).enabled).toBe(true);
    const entry = fs.readFileSync(path.join(configHome, 'autostart/purplemux-improved.desktop'), 'utf8');
    expect(entry).toContain(process.execPath);
    expect(entry).not.toContain('.mount_');
  });

  it('honors desktop-environment disabling and permits removing stale entries', () => {
    manager().setEnabled(true);
    const filename = path.join(directory, '.config/autostart/purplemux-improved.desktop');
    fs.appendFileSync(filename, 'Hidden=true\n');
    expect(manager().getStatus().enabled).toBe(false);
    fs.writeFileSync(filename, '[Desktop Entry]\nExec=/gone/app\n');
    expect(manager({ packaged: false }).getStatus().enabled).toBe(true);
    expect(manager({ packaged: false }).setEnabled(false).enabled).toBe(false);
  });

  it.each(['Hidden=true', 'X-GNOME-Autostart-enabled=false', '  X-GNOME-Autostart-enabled = false  \r'])('reads the desktop disable flag %s and clears it on enable', (flag) => {
    manager().setEnabled(true);
    const filename = path.join(directory, '.config/autostart/purplemux-improved.desktop');
    fs.appendFileSync(filename, `${flag}\n`);
    expect(manager().getStatus().enabled).toBe(false);
    expect(manager().setEnabled(true).enabled).toBe(true);
    expect(manager().getStatus().enabled).toBe(true);
    expect(fs.readFileSync(filename, 'utf8')).not.toContain(flag.trim());
  });

  it('ignores commented flags and flags in other desktop groups', () => {
    manager().setEnabled(true);
    const filename = path.join(directory, '.config/autostart/purplemux-improved.desktop');
    fs.appendFileSync(filename, '# Hidden=true\n# X-GNOME-Autostart-enabled=false\nX-GNOME-Autostart-enabled=true\n[Desktop Action Other]\nHidden=true\nX-GNOME-Autostart-enabled=false\n');
    expect(manager().getStatus().enabled).toBe(true);
    fs.writeFileSync(filename, '# [Desktop Entry]\n[Desktop Action Other]\nExec=/opt/app\n');
    expect(manager().getStatus().enabled).toBe(false);
  });

  it.each([{ packaged: false }, { executable: '/tmp/app' }, { executable: '/var/tmp/app' }, { executable: 'relative' }])('refuses unstable/development executable: %j', (options) => {
    expect(manager(options).getStatus().supported).toBe(false);
    expect(() => manager(options).setEnabled(true)).toThrow();
  });

  it('rejects non-Linux changes and invalid payloads', () => {
    expect(() => manager({ platform: 'darwin' }).setEnabled(false)).toThrow(/Linux/);
    expect(() => manager().setEnabled('true' as unknown as boolean)).toThrow(/boolean/);
  });

  it('surfaces filesystem failures and preserves the existing entry if executable is gone', () => {
    manager().setEnabled(true);
    expect(() => manager({ executable: '/missing/application' }).setEnabled(true)).toThrow();
    expect(manager().getStatus().enabled).toBe(true);
    const configHome = path.join(directory, 'not-a-directory');
    fs.writeFileSync(configHome, '');
    expect(() => manager({ configHome }).getStatus()).toThrow();
    expect(() => manager({ configHome }).setEnabled(true)).toThrow();
  });

  it('quotes Exec with both desktop-string and argument escaping', () => {
    const executable = '/opt/a b/"$`%\\app';
    const entry = buildDesktopEntry(executable);
    const exec = entry.split('\n').find((line) => line.startsWith('Exec='))!.slice(5);
    const argument = exec.replace(/\\\\/g, '\\').slice(1, -1).replace(/\\([\\"`$])/g, '$1').replace(/%%/g, '%');
    expect(argument).toBe(executable);
    expect(() => buildDesktopEntry('/opt/a\nExec=bad')).toThrow();
  });

  it('passes the installed desktop-entry validator with special paths', (context) => {
    if (spawnSync('desktop-file-validate', ['--help']).status !== 0) {
      context.skip();
      return;
    }
    const filename = path.join(directory, 'purplemux-improved.desktop');
    fs.writeFileSync(filename, buildDesktopEntry('/opt/a b/"$`%\\app'));
    const result = spawnSync('desktop-file-validate', [filename], { encoding: 'utf8' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});

it('restricts IPC to the exact local origin and main frame', () => {
  expect(isLocalStartupFrame('http://localhost:8022/settings', true, 8022, 'local')).toBe(true);
  expect(isLocalStartupFrame('http://localhost:8022/settings', true, 8022, 'remote')).toBe(false);
  for (const url of ['http://localhost:9999', 'https://localhost:8022', 'https://remote.example', 'file:///app', 'bad', undefined]) {
    expect(isLocalStartupFrame(url, true, 8022, 'local')).toBe(false);
  }
  expect(isLocalStartupFrame('http://localhost:8022', false, 8022, 'local')).toBe(false);
  expect(isLocalStartupFrame('http://localhost:8022', true, null, 'local')).toBe(false);
});

describe('desktop reuse of a Linux background server', () => {
  it('reuses an existing healthy server without invoking systemctl', async () => {
    const readState = vi.fn();
    expect(await waitForLinuxBackgroundServer(async () => 8123, readState)).toBe(8123);
    expect(readState).not.toHaveBeenCalled();
  });

  it('allows an embedded server when no managed service is active or systemd is absent', async () => {
    expect(await waitForLinuxBackgroundServer(async () => null, () => 'inactive')).toBeNull();
    expect(await waitForLinuxBackgroundServer(async () => null, () => { throw new Error('no systemd'); })).toBeNull();
  });

  it('waits for an activating service instead of racing its startup', async () => {
    vi.useFakeTimers();
    const getPort = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(8123);
    const result = waitForLinuxBackgroundServer(getPort, () => 'activating');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toBe(8123);
  });

  it('fails explicitly if the managed service does not become healthy', async () => {
    vi.useFakeTimers();
    const result = waitForLinuxBackgroundServer(async () => null, () => 'active', 2000);
    const assertion = expect(result).rejects.toThrow(/journalctl/);
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;
  });
});
