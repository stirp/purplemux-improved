/* eslint-disable @typescript-eslint/no-require-imports */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { bin } = require('../../package.json');

const root = path.resolve(__dirname, '../..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'pmux-entrypoints-'));
const serverMarker = 'SERVER_ENTRY_LOADED';

before(() => {
  fs.cpSync(path.join(root, 'bin'), path.join(fixture, 'bin'), { recursive: true });
  fs.mkdirSync(path.join(fixture, 'dist'));
  fs.writeFileSync(path.join(fixture, 'dist/server.js'), `process.stdout.write('${serverMarker}');`);
});
after(() => fs.rmSync(fixture, { recursive: true, force: true }));

const run = (binary, args, env = {}) => {
  const result = spawnSync(process.execPath, [path.join(fixture, bin[binary]), ...args], {
    cwd: fixture,
    env: { ...process.env, HOME: fixture, USERPROFILE: fixture, PMUX_PORT: '', PMUX_TOKEN: '', NO_UPDATE_NOTIFIER: '1', ...env },
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.ifError(result.error);
  return result;
};

test('package exposes the server launcher and the CLI-only entrypoint', () => {
  assert.deepEqual(bin, {
    'purplemux-improved': './bin/purplemux.js',
    pmuxi: './bin/cli.js',
  });
});

test('pmuxi without arguments and help aliases exit offline without loading the server', () => {
  for (const args of [[], ['help'], ['-h'], ['--help']]) {
    const result = run('pmuxi', args);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: pmuxi/);
    assert.match(result.stdout, /never starts a server/);
    assert.doesNotMatch(result.stdout, new RegExp(serverMarker));
  }
});

test('pmuxi rejects server commands, startup flags and unknown commands', () => {
  for (const args of [['start'], ['server'], ['--port', '8022'], ['--host', 'all'], ['typo']]) {
    const result = run('pmuxi', args);
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /error:/);
    assert.doesNotMatch(result.stdout, new RegExp(serverMarker));
    if (['start', 'server'].includes(args[0])) {
      assert.match(result.stderr, /pmuxi cannot start a server/);
    }
  }
});

test('both entrypoints export the complete bundled skill offline from another directory', () => {
  const skill = fs.readFileSync(path.join(root, 'bin/skills/pmuxi/SKILL.md'), 'utf8');
  for (const binary of Object.keys(bin)) {
    const result = run(binary, ['skill']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, skill);
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, new RegExp(serverMarker));
  }
});

test('skill help is offline and unsupported arguments fail without loading the server', () => {
  for (const binary of Object.keys(bin)) {
    for (const args of [['skill', '--help'], ['skill', '-h'], ['help', 'skill']]) {
      const result = run(binary, args);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /pmuxi skill/);
      assert.doesNotMatch(result.stdout, new RegExp(serverMarker));
    }
    for (const args of [['skill', 'install'], ['skill', '--unknown'], ['skill', '--help', 'extra']]) {
      const result = run(binary, args);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Usage: pmuxi skill/);
      assert.equal(result.stdout, '');
    }
  }
});

test('missing configuration and failed requests never load the server', () => {
  for (const [env, message] of [
    [{}, /PMUX_PORT not set/],
    [{ PMUX_PORT: '8022' }, /PMUX_TOKEN not set/],
    [{ PMUX_PORT: '0', PMUX_TOKEN: 'test-token' }, /fetch failed/],
  ]) {
    const result = run('pmuxi', ['workspaces'], env);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, message);
    assert.doesNotMatch(result.stdout, new RegExp(serverMarker));
  }
});

test('purplemux-improved still loads the server for no arguments and start', () => {
  for (const args of [[], ['start']]) {
    const result = run('purplemux-improved', args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, serverMarker);
  }
});
