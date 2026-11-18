import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { installProcessFatalObserver } from '@/lib/process-fatal-observer';

class FakeProcess extends EventEmitter {
  pid = 321;
  lines: string[] = [];
  stderr = { write: (line: string) => { this.lines.push(line); return true; } };
}

describe('installProcessFatalObserver', () => {
  it('records fatal exception identity and stack without adding a recovery listener', () => {
    const target = new FakeProcess();
    installProcessFatalObserver(target);
    const error = new TypeError('ioctl failed');

    target.emit('uncaughtExceptionMonitor', error, 'uncaughtException');

    expect(target.listenerCount('uncaughtException')).toBe(0);
    expect(target.lines).toHaveLength(1);
    const record = JSON.parse(target.lines[0].replace(/^\[fatal\] /u, ''));
    expect(record).toMatchObject({ event: 'fatal_error', pid: 321, origin: 'uncaughtException', name: 'TypeError', message: 'ioctl failed' });
    expect(record.stack).toContain('ioctl failed');
  });

  it('serializes non-Error throws and installs only once', () => {
    const target = new FakeProcess();
    installProcessFatalObserver(target);
    installProcessFatalObserver(target);

    target.emit('uncaughtExceptionMonitor', 'fatal text', 'unhandledRejection');

    expect(target.listenerCount('uncaughtExceptionMonitor')).toBe(1);
    expect(JSON.parse(target.lines[0].replace(/^\[fatal\] /u, ''))).toMatchObject({
      event: 'fatal_error', pid: 321, origin: 'unhandledRejection', name: 'NonError', message: 'fatal text', stack: null,
    });
  });
});
