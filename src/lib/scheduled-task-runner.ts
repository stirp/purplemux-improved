import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { getAgentEnvironment } from '@/lib/config-store';
import { getShellPath } from '@/lib/preflight';
import { buildShellEnv, defaultShell } from '@/lib/shell-env';
import { TASK_OUTPUT_BYTES, type IScheduledTask, type ITaskRun } from '@/lib/scheduled-tasks';
import { TASK_SUPERVISOR_SCRIPT } from '@/lib/scheduled-task-supervisor';

export const validateTaskDirectory = async (cwd: string) => {
  if (!path.isAbsolute(cwd) || !(await fs.stat(cwd).catch(() => null))?.isDirectory()) {
    throw Object.assign(new Error('Task directory must exist and be absolute'), { status: 400, code: 'directory' });
  }
};

export type TTaskExecution = Pick<ITaskRun, 'status' | 'output' | 'truncated' | 'exitCode' | 'reason'>;

export const executeScheduledTask = async (task: IScheduledTask, signal: AbortSignal): Promise<TTaskExecution> => {
  await validateTaskDirectory(task.cwd);
  const env = { ...buildShellEnv(), PATH: await getShellPath(), ...(task.kind === 'shell' ? {} : await getAgentEnvironment(task.kind)) };
  if (signal.aborted) return { status: 'interrupted', output: '', reason: 'shutdown' };
  const executable = task.kind === 'shell' ? defaultShell() : task.kind;
  const args = task.kind === 'shell' ? ['-lc', task.content]
    : task.kind === 'claude' ? ['-p', '--permission-mode', 'dontAsk', '--output-format', 'text']
      : ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', '-c', 'approval_policy="never"', '-'];

  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', TASK_SUPERVISOR_SCRIPT], {
      cwd: task.cwd, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
    });
    let output = Buffer.alloc(0);
    let truncated = false;
    let stopped: 'timed-out' | 'interrupted' | undefined;
    let failure: string | undefined;
    const kill = () => {
      child.kill('SIGTERM');
    };
    const stop = (status: typeof stopped) => { stopped ??= status; kill(); };
    const abort = () => stop('interrupted');
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('timed-out'), task.timeoutMinutes * 60000);
    const collect = (chunk: Buffer) => {
      truncated ||= output.length + chunk.length > TASK_OUTPUT_BYTES;
      output = Buffer.concat([output, chunk]).subarray(-TASK_OUTPUT_BYTES);
    };
    child.stdout!.on('data', collect);
    child.stderr!.on('data', collect);
    child.on('error', (error) => { failure = error.message; });
    child.stdin!.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') { failure = error.message; kill(); }
    });
    child.on('close', (code, exitSignal) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      resolve({ status: stopped ?? (failure || code !== 0 ? 'failed' : 'succeeded'), output: output.toString('utf8'), truncated,
        exitCode: code, reason: stopped ?? failure ?? (code !== 0 ? `exit: ${exitSignal ?? code}` : undefined) });
    });
    child.send({ executable, args }, (error) => { if (error) { failure = error.message; kill(); } });
    child.stdin!.end(task.kind === 'shell' ? undefined : task.content);
    if (signal.aborted) abort();
  });
};
