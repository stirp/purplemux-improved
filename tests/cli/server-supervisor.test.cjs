/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startSupervisor, validateUpdateDirectory } = require('../../bin/server-supervisor.cjs');

const setup = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'purplemux-update-test-'));
  const updates = path.join(root, 'updates');
  const makePackage = (directory, version) => {
    for (const file of ['dist/server.js', '.next/standalone/server.js', 'bin/purplemux.js']) {
      fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
      fs.writeFileSync(path.join(directory, file), '');
    }
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'purplemux-improved', version }));
    return directory;
  };
  const original = makePackage(path.join(root, 'original'), '0.5.6');
  const next = makePackage(path.join(updates, '0.6.0', 'node_modules', 'purplemux-improved'), '0.6.0');
  const host = Object.assign(new EventEmitter(), { env: { PORT: '9123', HOST: '127.0.0.1', CUSTOM: 'preserved' }, pid: 42, exitCodes: [] });
  host.exit = (code) => host.exitCodes.push(code);
  const children = [];
  const fork = (file, args, options) => {
    const child = Object.assign(new EventEmitter(), { file, args, options, signals: [], sent: [] });
    child.kill = (signal) => child.signals.push(signal);
    child.send = (message) => child.sent.push(message);
    children.push(child);
    return child;
  };
  t.after(() => {
    host.emit('SIGTERM');
    for (const child of children) child.emit('exit', 0);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, updates, original, next, host, children, fork };
};
const ready = (child, version, port = 9123) => child.emit('message', { type: 'purplemux:ready', version, port });

for (const requestedPort of ['0', '9123']) {
  test(`accepts initial port selection for PORT=${requestedPort} and pins upgrades and rollback to it`, (t) => {
    const s = setup(t);
    s.host.env.PORT = requestedPort;
    startSupervisor(s.original, s);
    assert.equal(s.children[0].options.env.PORT, requestedPort);
    ready(s.children[0], '0.5.6', 9234);
    assert.deepEqual(s.children[0].signals, []);
    s.children[0].emit('message', { type: 'purplemux:upgrade', directory: s.next });
    s.children[0].emit('exit', 0);
    assert.equal(s.children[1].options.env.PORT, '9234');
    ready(s.children[1], '0.6.0', 9235);
    assert.deepEqual(s.children[1].signals, ['SIGTERM']);
    s.children[1].emit('exit', 0);
    assert.equal(s.children[2].options.env.PORT, '9234');
    ready(s.children[2], '0.5.6', 9234);
    assert.deepEqual(s.children[2].signals, []);
  });
}

test('activates only after readiness and preserves environment and port', (t) => {
  const s = setup(t);
  startSupervisor(s.original, s);
  ready(s.children[0], '0.5.6');
  s.children[0].emit('message', { type: 'purplemux:upgrade', directory: s.next });
  assert.deepEqual(s.children[0].signals, ['SIGTERM']);
  s.children[0].emit('exit', 0);
  assert.equal(fs.existsSync(path.join(s.updates, 'active.json')), false);
  assert.equal(s.children[1].options.env.CUSTOM, 'preserved');
  assert.equal(s.children[1].options.env.PORT, '9123');
  assert.equal(s.children[1].options.env.HOST, '127.0.0.1');
  ready(s.children[1], '0.6.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(s.updates, 'active.json'))).directory, s.next);
});

test('a failed new process restores the old installation without changing the pointer', (t) => {
  const s = setup(t);
  startSupervisor(s.original, s);
  ready(s.children[0], '0.5.6');
  s.children[0].emit('message', { type: 'purplemux:upgrade', directory: s.next });
  s.children[0].emit('exit', 0);
  s.children[1].emit('exit', 1);
  assert.equal(s.children[2].file, path.join(s.original, 'dist/server.js'));
  assert.match(s.children[2].options.env.__PMUX_UPDATE_ERROR, /restored/);
  assert.equal(fs.existsSync(path.join(s.updates, 'active.json')), false);
  ready(s.children[2], '0.5.6');
});

test('spawn errors roll back only once even if exit follows', (t) => {
  const s = setup(t);
  startSupervisor(s.original, s);
  ready(s.children[0], '0.5.6');
  s.children[0].emit('message', { type: 'purplemux:upgrade', directory: s.next });
  s.children[0].emit('exit', 0);
  s.children[1].emit('error', new Error('spawn failure'));
  s.children[1].emit('exit', 1);
  assert.equal(s.children.length, 3);
  ready(s.children[2], '0.5.6');
});

test('does not accept a new server on a different port', (t) => {
  const s = setup(t);
  startSupervisor(s.original, s);
  ready(s.children[0], '0.5.6');
  s.children[0].emit('message', { type: 'purplemux:upgrade', directory: s.next });
  s.children[0].emit('exit', 0);
  ready(s.children[1], '0.6.0', 9999);
  assert.deepEqual(s.children[1].signals, ['SIGTERM']);
  s.children[1].emit('exit', 0);
  assert.equal(s.children[2].file, path.join(s.original, 'dist/server.js'));
});

test('rejects paths outside staging and symlink escapes', (t) => {
  const s = setup(t);
  assert.throws(() => validateUpdateDirectory(s.original, s.updates), /Invalid update directory/);
  fs.symlinkSync(s.original, path.join(s.updates, 'escape'));
  assert.throws(() => validateUpdateDirectory(path.join(s.updates, 'escape'), s.updates));
  startSupervisor(s.original, s);
  ready(s.children[0], '0.5.6');
  s.children[0].emit('message', { type: 'purplemux:upgrade', directory: s.original });
  assert.equal(s.children[0].signals.length, 0);
  assert.equal(s.children[0].sent[0].type, 'purplemux:upgrade-error');
});

test('subsequent launches select the saved update but prefer a newer explicit install', (t) => {
  const s = setup(t);
  fs.writeFileSync(path.join(s.updates, 'active.json'), JSON.stringify({ directory: s.next }));
  startSupervisor(s.original, s);
  assert.equal(s.children[0].file, path.join(s.next, 'dist/server.js'));
  ready(s.children[0], '0.6.0');
  fs.writeFileSync(path.join(s.original, 'package.json'), JSON.stringify({ name: 'purplemux-improved', version: '0.7.0' }));
  startSupervisor(s.original, s);
  assert.equal(s.children[1].file, path.join(s.original, 'dist/server.js'));
  ready(s.children[1], '0.7.0');
});
