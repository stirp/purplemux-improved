import * as fs from 'node:fs';
import * as path from 'node:path';

interface IDesktopAutostartOptions {
  platform: string;
  packaged: boolean;
  homeDir: string;
  configHome?: string;
  executable: string;
  appImage?: string;
}

export interface IDesktopAutostartStatus {
  supported: boolean;
  enabled: boolean;
  reason?: 'packagedOnly' | 'stablePathRequired';
}

export const buildDesktopEntry = (executable: string): string => {
  if (!path.isAbsolute(executable) || /[\x00-\x1f\x7f]/.test(executable)) {
    throw new Error('Desktop startup requires an absolute executable path without control characters.');
  }
  const quoted = executable.replace(/([\\"`$])/g, '\\$1').replace(/%/g, '%%');
  const exec = `"${quoted}"`.replace(/\\/g, '\\\\');
  return `[Desktop Entry]
Type=Application
Name=purplemux-improved
Exec=${exec}
Terminal=false
StartupNotify=false
`;
};

export const createDesktopAutostart = (options: IDesktopAutostartOptions) => {
  const configDir = options.configHome && path.isAbsolute(options.configHome)
    ? options.configHome : path.join(options.homeDir, '.config');
  const filename = path.join(configDir, 'autostart', 'purplemux-improved.desktop');
  const executable = options.appImage || options.executable;
  const getSupport = (): Pick<IDesktopAutostartStatus, 'supported' | 'reason'> => {
    if (options.platform !== 'linux' || !options.packaged) return { supported: false, reason: 'packagedOnly' };
    if (!path.isAbsolute(executable) || executable.includes('/.mount_') || executable.startsWith('/tmp/') || executable.startsWith('/var/tmp/')) {
      return { supported: false, reason: 'stablePathRequired' };
    }
    return { supported: true };
  };
  const getStatus = (): IDesktopAutostartStatus => {
    let entry = '';
    try {
      entry = fs.readFileSync(filename, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    let inDesktopEntry = false;
    let hasDesktopEntry = false;
    let disabled = false;
    for (const raw of entry.split(/\r?\n/)) {
      const line = raw.trim();
      if (line.startsWith('[')) inDesktopEntry = line === '[Desktop Entry]';
      if (inDesktopEntry) hasDesktopEntry = true;
      if (inDesktopEntry && /^(?:Hidden\s*=\s*true|X-GNOME-Autostart-enabled\s*=\s*false)$/.test(line)) disabled = true;
    }
    return { ...getSupport(), enabled: hasDesktopEntry && !disabled };
  };
  const setEnabled = (enabled: boolean): IDesktopAutostartStatus => {
    if (typeof enabled !== 'boolean') throw new Error('enabled must be a boolean');
    if (options.platform !== 'linux') throw new Error('Desktop startup is supported on Linux only.');
    if (!enabled) {
      fs.rmSync(filename, { force: true });
      return getStatus();
    }
    if (!getSupport().supported) throw new Error('Install the packaged application in a stable location before enabling startup.');
    fs.accessSync(executable, fs.constants.X_OK);
    const entry = buildDesktopEntry(executable);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const temporary = `${filename}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, entry, { mode: 0o600 });
      fs.renameSync(temporary, filename);
    } finally {
      fs.rmSync(temporary, { force: true });
    }
    return getStatus();
  };
  return { getStatus, setEnabled };
};

export const isLocalStartupFrame = (frameUrl: string | undefined, isMainFrame: boolean, localPort: number | null, serverMode: 'local' | 'remote'): boolean => {
  if (serverMode !== 'local' || !isMainFrame || !localPort || !frameUrl) return false;
  try {
    const url = new URL(frameUrl);
    return url.origin === `http://localhost:${localPort}`;
  } catch {
    return false;
  }
};

export const waitForLinuxBackgroundServer = async (
  getPort: () => Promise<number | null>,
  getServiceState: () => string,
  timeoutMs = 30_000,
): Promise<number | null> => {
  const existing = await getPort();
  if (existing) return existing;
  try {
    const state = getServiceState().trim();
    if (state !== 'active' && state !== 'activating') return null;
  } catch {
    return null;
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const port = await getPort();
    if (port) return port;
  }
  throw new Error('The background service did not become ready. Check journalctl --user -u purplemux-improved.service.');
};
