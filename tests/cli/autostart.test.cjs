/* eslint-disable @typescript-eslint/no-require-imports */
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildUnit, createManager } = require('../../bin/autostart');

let directory;
let calls;
let enabled;
let linger;
let fail;
let options;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pmux-startup-'));
  fs.mkdirSync(path.join(directory, 'bin'));
  fs.mkdirSync(path.join(directory, 'dist'));
  fs.writeFileSync(path.join(directory, 'dist/server.js'), '');
  enabled = false;
  linger = false;
  fail = '';
  calls = [];
  options = {
    platform: 'linux', homeDir: directory, configHome: path.join(directory, 'xdg'),
    username: 'fixture-user', nodePath: process.execPath, entryPath: path.join(directory, 'bin/purplemux.js'),
    pathEnv: '/usr/bin:/fixture/tools', port: '8123',
    run: (command, args) => {
      const key = [command, ...args].join(' ');
      calls.push(key);
      if (fail && key.includes(fail)) return { status: 1, stderr: 'permission denied', stdout: '' };
      if (args.includes('enable-linger')) linger = true;
      if (args.includes('enable')) enabled = true;
      if (args.includes('disable')) enabled = false;
      const stdout = args.includes('show-user') ? (linger ? 'yes' : 'no')
        : args.includes('--property=LoadState,UnitFileState,ActiveState')
          ? `LoadState=loaded\nUnitFileState=${enabled ? 'enabled' : 'disabled'}\nActiveState=active\n` : '';
      return { status: 0, stdout, stderr: '' };
    },
  };
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

test('enable and disable are idempotent, preserve running services and never disable lingering', () => {
  const manager = createManager(options);
  for (let index = 0; index < 2; index++) {
    assert.deepEqual(manager.enable(false), { enabled: true, active: true, bootEnabled: false, linger: false, path: manager.readStatus().path });
  }
  const unit = fs.readFileSync(manager.readStatus().path, 'utf8');
  assert.match(unit, /PORT=8123/);
  assert.match(unit, /PATH=\/usr\/bin:\/fixture\/tools/);
  assert.match(unit, /^KillMode=control-group$/m);
  assert.equal(manager.enable(true).bootEnabled, true);
  for (let index = 0; index < 2; index++) {
    const status = manager.disable();
    assert.equal(status.enabled, false);
    assert.equal(status.active, true);
    assert.equal(status.linger, true);
    assert.equal(status.bootEnabled, false);
    assert.equal(fs.existsSync(status.path), true);
  }
  assert.ok(calls.every((call) => !/--now| restart | stop | start |disable-linger/.test(call)));
});

test('a missing unit is disabled and status does not create files', () => {
  const manager = createManager(options);
  assert.equal(manager.readStatus().enabled, false);
  assert.equal(fs.existsSync(manager.readStatus().path), false);
  manager.disable();
  assert.ok(calls.every((call) => !call.includes(' disable ')));
});

test('re-enabling replaces legacy process-only cleanup without restarting the server', () => {
  const manager = createManager(options);
  const filename = manager.readStatus().path;
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, buildUnit(options).replace('KillMode=control-group', 'KillMode=process'));
  const status = manager.enable(false);
  const unit = fs.readFileSync(filename, 'utf8');
  assert.match(unit, /^KillMode=control-group$/m);
  assert.doesNotMatch(unit, /^KillMode=(process|none)$/m);
  assert.equal(status.active, true);
  assert.ok(calls.includes('systemctl --user daemon-reload'));
  assert.ok(calls.every((call) => !/--now| restart | stop | start /.test(call)));
});

test('unknown linger state never claims boot startup', () => {
  fail = 'show-user';
  const status = createManager(options).enable(false);
  assert.equal(status.enabled, true);
  assert.equal(status.linger, null);
  assert.equal(status.bootEnabled, false);
});

test('manager errors, unsupported platforms and denied lingering do not install a unit', () => {
  const manager = createManager(options);
  const unitPath = manager.readStatus().path;
  for (const failure of ['--property=Version', 'enable-linger']) {
    fail = failure;
    assert.throws(() => manager.enable(true), /permission denied/);
    assert.equal(fs.existsSync(unitPath), false);
  }
  assert.throws(() => createManager({ ...options, platform: 'darwin' }).enable(false), /Linux/);
});

test('failed enable restores an existing unit or removes a new unit', () => {
  const manager = createManager(options);
  const filename = manager.readStatus().path;
  fail = '--user enable';
  assert.throws(() => manager.enable(false), /permission denied/);
  assert.equal(fs.existsSync(filename), false);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, 'previous contents');
  assert.throws(() => manager.enable(false), /permission denied/);
  assert.equal(fs.readFileSync(filename, 'utf8'), 'previous contents');
  assert.deepEqual(fs.readdirSync(path.dirname(filename)), ['purplemux-improved.service']);
});

test('failed disable is reported and retains the unit', () => {
  const manager = createManager(options);
  const { path: filename } = manager.enable(false);
  fail = '--user disable';
  assert.throws(() => manager.disable(), /permission denied/);
  assert.equal(fs.existsSync(filename), true);
});

test('build requirement and invalid PORT are checked before changing lingering', () => {
  assert.throws(() => createManager({ ...options, entryPath: '/missing/bin/purplemux.js' }).enable(true), /Built server not found/);
  for (const port of ['0', '65536', '123x', '1\nEnvironment=SECRET']) {
    assert.throws(() => createManager({ ...options, port }).enable(true), /PORT/);
  }
  assert.ok(calls.every((call) => !call.includes('enable-linger')));
});

test('unit escapes systemd specifiers, variable substitution, quotes and backslashes', () => {
  const unit = buildUnit({ ...options, nodePath: '/opt/a b%u$HOME/"node"', entryPath: '/opt/a\\b/entry.js' });
  assert.ok(unit.includes('ExecStart=:/usr/bin/env -- "/opt/a b%%u$HOME/\\"node\\""'));
  assert.ok(unit.includes('"/opt/a\\\\b/entry.js"'));
  assert.doesNotMatch(unit, /PMUX_TOKEN|__PMUX_PRISTINE_ENV/);
  assert.throws(() => buildUnit({ ...options, nodePath: '/opt/node\nExecStart=bad' }), /control characters/);
  assert.throws(() => buildUnit({ ...options, nodePath: 'node' }), /absolute paths/);
});

test('systemd parses the generated unit including special executable paths', (context) => {
  if (spawnSync('systemd-analyze', ['--version']).status !== 0) {
    context.skip('systemd-analyze is not installed');
    return;
  }
  const nodePath = path.join(directory, 'node % $test "quoted" \\backslash');
  fs.symlinkSync(process.execPath, nodePath);
  const filename = path.join(directory, 'purplemux-improved.service');
  fs.writeFileSync(filename, buildUnit({ ...options, nodePath }));
  const result = spawnSync('systemd-analyze', ['--user', 'verify', filename], { encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
});

test('relative XDG config is ignored', () => {
  const status = createManager({ ...options, configHome: 'relative' }).readStatus();
  assert.equal(status.path, path.join(directory, '.config/systemd/user/purplemux-improved.service'));
});

test('public entrypoint handles offline help and errors without starting the server', () => {
  for (const [entry, args, code] of [
    ['purplemux.js', ['autostart', '--help'], 0],
    ['purplemux.js', ['autostart'], 0],
    ['purplemux.js', ['autostart', 'enable', '--now'], 1],
    ['purplemux.js', ['autostart', 'disable', '--boot'], 1],
    ['cli.js', ['autostart', 'enable'], 1],
  ]) {
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../../bin', entry), ...args], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, code, result.stderr);
    assert.doesNotMatch(result.stdout, /Listening|Starting server/);
  }
});
