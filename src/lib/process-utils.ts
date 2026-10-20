import fs from 'fs/promises';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { getBuiltinModule } from 'node:process';
import { isLinux } from '@/lib/platform';
import { getDarwinProcessArgv } from '@/lib/darwin-process-argv';

const execFile = promisify(execFileCb);

export const isProcessRunning = (pid: number): Promise<boolean> =>
  new Promise((resolve) => {
    execFileCb('ps', ['-p', String(pid)], (err) => {
      resolve(!err);
    });
  });

export const getChildPids = async (parentPid: number): Promise<number[]> => {
  try {
    const { stdout } = await execFile('pgrep', ['-P', String(parentPid)]);
    return stdout.trim().split('\n').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
};

export const getProcessCwd = async (pid: number): Promise<string | null> => {
  if (isLinux) {
    try {
      return await fs.readlink(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }
  try {
    const { stdout } = await execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const line = stdout.split('\n').find((l) => l.startsWith('n/'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
};

export const parseSemanticVersion = (stdout: string): string | null =>
  stdout.trim().match(/(\d+\.\d+[\d.]*)/)?.[1] ?? null;

export const getProcessArgs = async (
  pid: number | string,
  options?: { timeoutMs?: number },
): Promise<string | null> => {
  try {
    const { stdout } = await execFile(
      'ps', ['-p', String(pid), '-o', 'args='],
      options?.timeoutMs ? { timeout: options.timeoutMs } : {},
    );
    return stdout.trim();
  } catch {
    return null;
  }
};

export const getProcessStartTimeMs = async (
  pid: number | string,
  options?: { timeoutMs?: number },
): Promise<number | null> => {
  try {
    const { stdout } = await execFile(
      'ps', ['-p', String(pid), '-o', 'lstart='],
      options?.timeoutMs ? { timeout: options.timeoutMs } : {},
    );
    const parsed = Date.parse(stdout.trim().replace(/\s+/g, ' '));
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export interface ISystemProcess {
  pid: number;
  ppid: number;
  uid: number;
  startedAt: string;
  args: string;
}

export const parseSystemProcesses = (stdout: string): ISystemProcess[] =>
  stdout.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(\S+)\s+(.*)$/);
    if (!match || match[5].startsWith('Z')) return [];
    const time = Date.parse(match[4]);
    if (!Number.isFinite(time)) return [];
    return [{ pid: Number(match[1]), ppid: Number(match[2]), uid: Number(match[3]), startedAt: new Date(time).toISOString(), args: match[6] }];
  });

export const listUserProcesses = async (): Promise<ISystemProcess[]> => {
  if (!process.getuid || !['linux', 'darwin'].includes(process.platform)) {
    throw new Error('Process management requires Linux or macOS');
  }
  const { stdout } = await execFile('ps', ['-axo', 'pid=,ppid=,uid=,lstart=,stat=,args='], {
    timeout: 5000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, LC_ALL: 'C' },
  });
  return parseSystemProcesses(stdout).filter((item) => item.uid === process.getuid!());
};

export const getProcessArgv = async (item: Pick<ISystemProcess, 'pid' | 'args'>): Promise<string[]> => {
  if (!Number.isInteger(item.pid) || item.pid <= 0 || item.pid > 0x7fffffff) return [];
  try {
    // Resolve at runtime so Next.js does not fold the build host's platform into the bundle.
    const platform = getBuiltinModule('node:os').platform();
    if (platform === 'linux') {
      const raw = await fs.readFile(`/proc/${item.pid}/cmdline`, 'utf8');
      return raw.endsWith('\0') ? raw.slice(0, -1).split('\0') : [];
    }
    if (platform === 'darwin') return await getDarwinProcessArgv(item.pid);
  } catch { /* Exited or inaccessible processes have no reliable argv. */ }
  return [];
};

export const getProcessOpenFiles = async (pid: number): Promise<string[]> => {
  try {
    if (isLinux) {
      const directory = `/proc/${pid}/fd`;
      const entries = await fs.readdir(directory);
      return (await Promise.all(entries.map((entry) => fs.readlink(`${directory}/${entry}`).catch(() => ''))))
        .filter((file) => file.startsWith('/'));
    }
    const { stdout } = await execFile('lsof', ['-a', '-p', String(pid), '-Fn'], { timeout: 2000, maxBuffer: 2 * 1024 * 1024 });
    return stdout.split('\n').filter((line) => line.startsWith('n/')).map((line) => line.slice(1));
  } catch { return []; }
};
