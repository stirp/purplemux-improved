/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const createLifecycleRecorder = (options = {}) => {
  const fileSystem = options.fs || fs;
  const directory = options.directory || path.join(os.homedir(), '.purplemux', 'logs');
  const lifecycleFile = path.join(directory, 'process-lifecycle.jsonl');
  const lastExitFile = options.lastExitFile || path.join(directory, '..', 'last-exit.json');
  const now = options.now || Date.now;
  const supervisorPid = options.pid || process.pid;
  const onError = options.onError || ((message) => process.stderr.write(`[lifecycle] ${message}\n`));
  let sequence = 0;

  const complete = (event) => ({ timestamp: now(), supervisorPid, ...event });
  const report = (error) => {
    const message = error instanceof Error ? error.message : String(error);
    try { onError(`Unable to persist process lifecycle: ${message}`); } catch { /* diagnostics remain best effort */ }
    return false;
  };
  const prepare = () => fileSystem.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const append = (event) => {
    try {
      prepare();
      fileSystem.appendFileSync(lifecycleFile, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
      return true;
    } catch (error) {
      return report(error);
    }
  };

  return {
    record(event) {
      return append(complete(event));
    },
    recordExit(event) {
      const entry = complete(event);
      try {
        prepare();
        fileSystem.appendFileSync(lifecycleFile, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
        const temporary = `${lastExitFile}.${supervisorPid}.${sequence++}.tmp`;
        fileSystem.writeFileSync(temporary, `${JSON.stringify(entry, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
        fileSystem.renameSync(temporary, lastExitFile);
        return true;
      } catch (error) {
        return report(error);
      }
    },
  };
};

module.exports = { createLifecycleRecorder };
