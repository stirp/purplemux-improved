/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { fork } = require('node:child_process');

const newer = (a, b) => {
  const valid = (v) => typeof v === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v);
  if (!valid(a) || !valid(b)) return false;
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  const index = left.findIndex((part, i) => part !== right[i]);
  return index >= 0 && left[index] > right[index];
};

const validateUpdateDirectory = (directory, updates) => {
  const resolved = fs.realpathSync(directory);
  const relative = path.relative(fs.realpathSync(updates), resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid update directory');
  const manifest = JSON.parse(fs.readFileSync(path.join(resolved, 'package.json'), 'utf8'));
  if (manifest.name !== 'purplemux-improved') throw new Error('Invalid update package');
  for (const file of ['dist/server.js', 'bin/purplemux.js', '.next/standalone/server.js']) fs.accessSync(path.join(resolved, file));
  return { directory: resolved, version: manifest.version };
};

const startSupervisor = (originalDirectory, options = {}) => {
  const host = options.host || process;
  const spawn = options.fork || fork;
  const updates = options.updates || path.join(os.homedir(), '.purplemux', 'updates');
  const pointer = path.join(updates, 'active.json');
  const original = { directory: originalDirectory, version: JSON.parse(fs.readFileSync(path.join(originalDirectory, 'package.json'), 'utf8')).version };
  let active = original;
  try {
    const saved = validateUpdateDirectory(JSON.parse(fs.readFileSync(pointer, 'utf8')).directory, updates);
    if (newer(saved.version, original.version)) active = saved;
  } catch { /* An absent or invalid pointer falls back to the installed package. */ }
  let child;
  let pending = null;
  let previous = original;
  let stopping = false;
  let actualPort;

  const launch = (target, candidate = false, updateError = '') => {
    child = spawn(path.join(target.directory, 'dist/server.js'), [], {
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: { ...host.env, NODE_ENV: 'production', __PMUX_APP_DIR: target.directory, __PMUX_SUPERVISED: '1', __PMUX_UPDATE_ERROR: updateError, ...(actualPort ? { PORT: actualPort } : {}) },
      execArgv: [],
    });
    const current = child;
    let ready = false;
    let failed = false;
    const timeout = setTimeout(() => {
      failed = true;
      console.error('[updater] Server startup timed out');
      current.kill('SIGKILL');
    }, options.startupTimeout || 120_000);
    current.on('message', (message) => {
      if (!message || current !== child || stopping || failed) return;
      if (message.type === 'purplemux:ready' && message.version === target.version && Number.isInteger(message.port) && message.port > 0 && message.port <= 65535) {
        if (actualPort && Number(actualPort) !== message.port) {
          failed = true;
          current.kill('SIGTERM');
          return;
        }
        try {
          if (candidate) {
            fs.mkdirSync(updates, { recursive: true });
            const temporary = `${pointer}.${host.pid}.tmp`;
            fs.writeFileSync(temporary, JSON.stringify(target), { mode: 0o600 });
            fs.renameSync(temporary, pointer);
          }
          ready = true;
          clearTimeout(timeout);
          actualPort = String(message.port);
          active = target;
        } catch (error) {
          console.error('[updater] Cannot activate update:', error.message);
          failed = true;
          current.kill('SIGTERM');
        }
      } else if (message.type === 'purplemux:upgrade' && ready && !pending) {
        try {
          const next = validateUpdateDirectory(message.directory, updates);
          if (!newer(next.version, active.version)) throw new Error('Update must be newer than the running version');
          previous = active;
          pending = next;
          current.kill('SIGTERM');
        } catch (error) {
          console.error('[updater] Upgrade rejected:', error.message);
          current.send({ type: 'purplemux:upgrade-error', error: error.message });
        }
      }
    });
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (stopping) return host.exit(code || 0);
      if (pending) {
        const next = pending;
        pending = null;
        launch(next, true);
      } else if (!ready && candidate) {
        console.error('[updater] New version failed to start; restoring previous version');
        launch(previous, false, 'The new version failed to start. The previous version has been restored.');
      } else if (!ready && target.directory !== original.directory) {
        launch(original);
      } else {
        host.exit(code || (ready ? 0 : 1));
      }
    };
    current.on('error', (error) => {
      console.error('[updater] Server process error:', error.message);
      finish(1);
    });
    current.on('exit', finish);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) host.on(signal, () => {
    if (stopping) return;
    stopping = true;
    child?.kill(signal);
  });
  launch(active);
};

module.exports = { startSupervisor, validateUpdateDirectory, newer };
