/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SERVICE = 'purplemux-improved.service';
const HELP = `Usage: purplemux-improved autostart <enable [--boot] | disable | status>

Linux systemd user service:
  enable          Start the background server at future logins
  enable --boot   Also enable user lingering to start before login (may require authorization)
  disable         Disable future automatic starts; keep the running server and user lingering
  status          Show enabled, active, lingering and boot status as JSON

These commands do not start or stop the running server.
Install in a stable location first. After moving Node or the package, run enable again.
Use 'journalctl --user -u ${SERVICE}' to read service logs.
`;

const quoteUnit = (value) => {
  if (/[\x00-\x1f\x7f]/.test(value)) throw new Error('Startup paths and environment must not contain control characters.');
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%');
  return `"${escaped}"`;
};

const buildUnit = ({ nodePath, entryPath, homeDir, pathEnv, port }) => {
  if (![nodePath, entryPath, homeDir].every((value) => path.isAbsolute(value))) {
    throw new Error('Startup executable and working directory must be absolute paths.');
  }
  if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return `[Unit]
Description=purplemux-improved background server
After=network.target

[Service]
Type=simple
WorkingDirectory=%h
ExecStart=:/usr/bin/env -- ${quoteUnit(nodePath)} ${quoteUnit(entryPath)} start
Environment=${quoteUnit(`PATH=${pathEnv}`)}
Environment=NODE_ENV=production PORT=${Number(port)}
Restart=on-failure
RestartSec=5
KillMode=process

[Install]
WantedBy=default.target
`;
};

const createManager = (options = {}) => {
  const homeDir = options.homeDir ?? os.homedir();
  const configHome = options.configHome ?? process.env.XDG_CONFIG_HOME;
  const unitPath = path.join(configHome && path.isAbsolute(configHome) ? configHome : path.join(homeDir, '.config'), 'systemd/user', SERVICE);
  const run = options.run ?? spawnSync;
  const username = options.username ?? os.userInfo().username;
  const platform = options.platform ?? process.platform;
  const execute = (command, args) => {
    const result = run(command, args, { encoding: 'utf8', timeout: 15_000 });
    if (result.error || result.status !== 0) {
      throw new Error(`${command} failed: ${result.error?.message || result.stderr?.trim() || `exit ${result.status}`}. A working systemd user session is required.`);
    }
    return result.stdout.trim();
  };
  const systemctl = (...args) => execute('systemctl', ['--user', ...args]);
  const assertSupported = () => {
    if (platform !== 'linux') throw new Error('autostart is supported on Linux with systemd only.');
    systemctl('show', '--property=Version');
  };
  const readStatus = () => {
    assertSupported();
    const result = run('systemctl', ['--user', 'show', SERVICE, '--property=LoadState,UnitFileState,ActiveState'], { encoding: 'utf8', timeout: 15_000 });
    const properties = Object.fromEntries((result.stdout || '').trim().split('\n').map((line) => line.split('=')));
    if (result.error || (result.status !== 0 && properties.LoadState !== 'not-found')) {
      throw new Error(`Unable to read service state: ${result.error?.message || result.stderr?.trim() || result.status}`);
    }
    let linger = null;
    try {
      const value = execute('loginctl', ['show-user', username, '--property=Linger', '--value']);
      linger = value === 'yes' ? true : value === 'no' ? false : null;
    } catch { /* Status remains useful when logind is unavailable. */ }
    const enabled = properties.UnitFileState === 'enabled';
    return { enabled, active: properties.ActiveState === 'active', linger, bootEnabled: enabled && linger === true, path: unitPath };
  };
  const enable = (boot) => {
    assertSupported();
    const entryPath = options.entryPath ?? path.join(__dirname, 'purplemux.js');
    if (!fs.existsSync(path.join(path.dirname(entryPath), '../dist/server.js'))) {
      throw new Error('Built server not found. Install the package or run pnpm build before enabling startup.');
    }
    const unit = buildUnit({
      nodePath: options.nodePath ?? process.execPath,
      entryPath,
      homeDir,
      pathEnv: options.pathEnv ?? (process.env.PATH || '/usr/local/bin:/usr/bin:/bin'),
      port: options.port ?? process.env.PORT ?? '8022',
    });
    if (boot) execute('loginctl', ['enable-linger', username]);
    const previous = fs.existsSync(unitPath) ? fs.readFileSync(unitPath, 'utf8') : null;
    fs.mkdirSync(path.dirname(unitPath), { recursive: true });
    const temporary = `${unitPath}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temporary, unit, { mode: 0o600 });
      fs.renameSync(temporary, unitPath);
      systemctl('daemon-reload');
      systemctl('enable', SERVICE);
    } catch (error) {
      if (previous === null) fs.rmSync(unitPath, { force: true });
      else fs.writeFileSync(unitPath, previous, { mode: 0o600 });
      fs.rmSync(temporary, { force: true });
      try { systemctl('daemon-reload'); } catch { /* Keep the original error. */ }
      throw error;
    }
    const status = readStatus();
    if (!status.enabled || (boot && !status.bootEnabled)) {
      throw new Error(`Startup was not fully enabled. Inspect 'purplemux-improved autostart status'. User lingering is not automatically reverted.`);
    }
    return status;
  };
  const disable = () => {
    assertSupported();
    if (fs.existsSync(unitPath)) systemctl('disable', SERVICE);
    const status = readStatus();
    if (status.enabled) throw new Error('Service remains enabled; inspect systemctl --user status purplemux-improved.service.');
    return status;
  };
  return { enable, disable, readStatus };
};

const main = (args) => {
  if (!args.length || (args.length === 1 && ['--help', '-h', 'help'].includes(args[0]))) {
    process.stdout.write(HELP);
    return;
  }
  const [action, flag] = args;
  if (!['enable', 'disable', 'status'].includes(action) || args.length > 2 || (flag && (action !== 'enable' || flag !== '--boot'))) {
    throw new Error(HELP);
  }
  const manager = createManager();
  const status = action === 'enable' ? manager.enable(flag === '--boot') : action === 'disable' ? manager.disable() : manager.readStatus();
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
  if (action === 'enable') {
    process.stderr.write(status.bootEnabled
      ? 'Enabled for future boots, including before login. The running server was not changed.\n'
      : 'Enabled for future logins only. For startup before login, run: purplemux-improved autostart enable --boot\n');
  }
};

module.exports = { buildUnit, createManager, main };
