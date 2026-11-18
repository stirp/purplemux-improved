interface IProcessFatalTarget {
  pid: number;
  stderr: { write: (value: string) => unknown };
  on: (event: 'uncaughtExceptionMonitor', listener: (error: unknown, origin: string) => void) => unknown;
}

const installed = new WeakSet<object>();

const describeError = (error: unknown) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack ?? null };
  }
  return { name: 'NonError', message: String(error), stack: null };
};

export const installProcessFatalObserver = (target: IProcessFatalTarget = process): void => {
  if (installed.has(target)) return;
  installed.add(target);
  target.on('uncaughtExceptionMonitor', (error, origin) => {
    const record = {
      timestamp: Date.now(),
      event: 'fatal_error',
      pid: target.pid,
      origin,
      ...describeError(error),
    };
    try {
      target.stderr.write(`[fatal] ${JSON.stringify(record)}\n`);
    } catch { /* Never replace the original fatal exception with a diagnostic failure. */ }
  });
};
