// IPC closes even when the server is killed, allowing the supervisor to clean its process group.
export const TASK_SUPERVISOR_SCRIPT = `
const { spawn } = require('node:child_process');
let child;
let closing = false;
const killGroup = () => {
  if (!child) return;
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
    else child.kill('SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill('SIGKILL');
  }
};
const stop = () => {
  closing = true;
  killGroup();
  if (!child) process.exit(1);
};
process.on('disconnect', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.once('message', ({ executable, args }) => {
  if (closing) return;
  child = spawn(executable, args, { detached: process.platform !== 'win32', stdio: 'pipe' });
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.pipe(process.stderr);
  child.stdin.on('error', (error) => { if (error.code !== 'EPIPE') { console.error(error.message); stop(); } });
  child.on('error', (error) => console.error(error.message));
  child.on('exit', killGroup);
  child.on('close', (code) => {
    killGroup();
    process.exitCode = closing ? 1 : code ?? 1;
    process.stdin.destroy();
    if (process.connected) process.disconnect();
  });
});
`;
