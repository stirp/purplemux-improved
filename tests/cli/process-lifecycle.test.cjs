/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLifecycleRecorder } = require('../../bin/process-lifecycle.cjs');

test('appends lifecycle events and atomically stores the latest exit', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'purplemux-lifecycle-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const recorder = createLifecycleRecorder({ directory, now: () => 1234, pid: 42 });

  assert.equal(recorder.record({ event: 'spawn', childPid: 100 }), true);
  assert.equal(recorder.recordExit({ event: 'exit', childPid: 100, code: null, signal: 'SIGKILL' }), true);

  const lines = fs.readFileSync(path.join(directory, 'process-lifecycle.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(lines, [
    { timestamp: 1234, supervisorPid: 42, event: 'spawn', childPid: 100 },
    { timestamp: 1234, supervisorPid: 42, event: 'exit', childPid: 100, code: null, signal: 'SIGKILL' },
  ]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, '..', 'last-exit.json'), 'utf8')), lines[1]);
  assert.equal(fs.statSync(path.join(directory, 'process-lifecycle.jsonl')).mode & 0o777, 0o600);
  assert.equal(fs.readdirSync(directory).some((name) => name.includes('.tmp')), false);
});

test('contains recorder failures and reports them without interrupting control flow', () => {
  const errors = [];
  const recorder = createLifecycleRecorder({
    directory: '/unwritable',
    fs: { mkdirSync: () => { throw new Error('disk unavailable'); } },
    onError: (message) => errors.push(message),
  });

  assert.equal(recorder.record({ event: 'spawn' }), false);
  assert.equal(recorder.recordExit({ event: 'exit' }), false);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /disk unavailable/);
});
