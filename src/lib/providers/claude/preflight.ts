import { execFile as execFileCb } from 'child_process';
import { access } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { getShellPath } from '@/lib/preflight';
import { buildShellEnv, defaultShell } from '@/lib/shell-env';
import { parseSemanticVersion } from '@/lib/process-utils';
import type { IAgentPreflight } from '@/lib/providers/types';

const execFile = promisify(execFileCb);
const CMD_TIMEOUT = 5000;

const CLAUDE_KNOWN_DIRS = [path.join(os.homedir(), '.local', 'bin')];

const findClaudeBinary = async (): Promise<string | null> => {
  for (const dir of CLAUDE_KNOWN_DIRS) {
    try {
      await access(path.join(dir, 'claude'));
      return dir;
    } catch {
      // not found
    }
  }
  return null;
};

const checkClaudeLogin = async (): Promise<boolean> => {
  try {
    await access(path.join(os.homedir(), '.claude'));
    return true;
  } catch {
    return false;
  }
};

export const runClaudePreflight = async (): Promise<IAgentPreflight> => {
  const resolvedPath = await getShellPath();
  let installed = false;
  let version: string | null = null;
  try {
    const { stdout } = await execFile('claude', ['--version'], {
      timeout: CMD_TIMEOUT,
      env: { ...process.env, PATH: resolvedPath },
    });
    installed = true;
    version = parseSemanticVersion(stdout);
  } catch {
    try {
      const shell = defaultShell();
      const { stdout } = await execFile(shell, ['-ilc', 'claude --version'], {
        timeout: CMD_TIMEOUT,
        env: {
          ...buildShellEnv(),
          SHELL: shell,
          DISABLE_AUTO_UPDATE: 'true',
          ZSH_TMUX_AUTOSTARTED: 'true',
        },
      });
      installed = true;
      version = parseSemanticVersion(stdout);
    } catch {
      installed = false;
    }
  }

  const binaryPath = installed ? null : await findClaudeBinary();
  const loggedIn = installed || binaryPath ? await checkClaudeLogin() : false;

  return { installed, version, binaryPath, loggedIn };
};
