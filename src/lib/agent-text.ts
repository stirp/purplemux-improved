import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile, spawn } from 'child_process';
import { getShellPath } from '@/lib/preflight';
import { buildShellEnv, defaultShell } from '@/lib/shell-env';
import type { TAgentProvider } from '@/lib/config-store';

interface IAgentTextOptions {
  cwd?: string;
  environment?: Record<string, string>;
  textOnly?: boolean;
}

const runClaudeShell = (shell: string, command: string, prompt: string, cwd: string | undefined, env: NodeJS.ProcessEnv): Promise<string> =>
  new Promise((resolve, reject) => {
    const processGroup = process.platform !== 'win32';
    const child = spawn(shell, ['-ilc', command], { cwd, env, detached: processGroup, stdio: 'pipe' });
    const output: Buffer[] = [];
    let outputBytes = 0;
    let failure: Error | undefined;
    const terminate = (error: Error) => {
      failure ??= error;
      try {
        if (processGroup && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch (killError) {
        if ((killError as NodeJS.ErrnoException).code !== 'ESRCH') {
          failure = killError as Error;
          child.kill('SIGKILL');
        }
      }
    };
    const timer = setTimeout(() => terminate(new Error('Claude login shell timed out after 120000 ms')), 120_000);
    const collect = (chunk: Buffer, stdout: boolean) => {
      if (failure) return;
      outputBytes += chunk.length;
      if (outputBytes > 1024 * 1024) terminate(new Error('Claude login shell output exceeded 1048576 bytes'));
      else if (stdout) output.push(chunk);
    };
    child.stdout.on('data', (chunk: Buffer) => collect(chunk, true));
    child.stderr.on('data', (chunk: Buffer) => collect(chunk, false));
    child.on('error', (error) => { failure ??= error; });
    child.stdin.on('error', terminate);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (failure || code !== 0) {
        // Clean descendants before the caller removes the temporary working directory.
        terminate(failure ?? new Error(`Claude login shell exited with ${signal ?? code}`));
        reject(failure);
      } else resolve(Buffer.concat(output).toString('utf8').trim());
    });
    child.stdin.end(prompt);
  });

const callClaudeCli = async (input: string, systemPrompt: string, options: IAgentTextOptions): Promise<string> => {
  const resolvedPath = await getShellPath();
  const directory = options.textOnly ? await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-text-only-')) : undefined;
  const args = ['-p', ...(options.textOnly ? [
    '--bare', '--tools', '', '--disallowedTools', '*',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
    '--no-session-persistence', '--output-format', 'text',
  ] : [])];
  const prompt = systemPrompt + '\n\n' + input;
  const run = (): Promise<string> => new Promise((resolve, reject) => {
    const child = execFile('claude', args, {
      timeout: 120_000, maxBuffer: 1024 * 1024, cwd: directory ?? options.cwd,
      env: { ...process.env, PATH: resolvedPath, ...options.environment },
    }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
    child.stdin?.end(prompt);
  });
  try {
    try {
      return await run();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const shell = defaultShell();
      const command = `claude ${args.map((arg) => `'${arg.replace(/'/g, `'\\''`)}'`).join(' ')}`;
      return await runClaudeShell(shell, command, prompt, directory ?? options.cwd, {
        ...buildShellEnv(), SHELL: shell,
        DISABLE_AUTO_UPDATE: 'true', ZSH_TMUX_AUTOSTARTED: 'true',
        ...options.environment,
      });
    }
  } catch (error) {
    throw new Error(`claude -p failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
};

const callCodexCli = async (input: string, systemPrompt: string, options: IAgentTextOptions): Promise<string> => {
  // read-only limits writes, not tool access. Fail before spawning a process.
  if (options.textOnly) throw new Error('Codex CLI cannot guarantee tool-free text generation. Select Claude Code for this scenario.');
  const resolvedPath = await getShellPath();
  const prompt = `${systemPrompt}\n\n${input}`;
  const outputPath = path.join(
    os.tmpdir(),
    `purplemux-agent-text-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
  );
  return new Promise((resolve, reject) => {
    const child = execFile(
      'codex',
      [
        'exec',
        '--skip-git-repo-check',
        // Do not create persistent session rollout files for one-shot calls.
        '--ephemeral',
        '--sandbox',
        'read-only',
        '-c',
        'approval_policy="never"',
        '-o',
        outputPath,
        prompt,
      ],
      { timeout: 120_000, maxBuffer: 1024 * 1024, cwd: options.cwd, env: { ...process.env, PATH: resolvedPath, ...options.environment } },
      async (error, stdout, stderr) => {
        if (error) {
          await fs.unlink(outputPath).catch(() => {});
          reject(new Error(`codex exec failed: ${error.message}${stderr ? `: ${stderr.trim()}` : ''}`));
          return;
        }
        const output = await fs.readFile(outputPath, 'utf-8').catch(() => stdout);
        await fs.unlink(outputPath).catch(() => {});
        resolve(output.trim());
      },
    );
    child.stdin?.end();
  });
};

export const callAgentText = (
  provider: TAgentProvider,
  input: string,
  systemPrompt: string,
  options: IAgentTextOptions = {},
): Promise<string> =>
  provider === 'codex'
    ? callCodexCli(input, systemPrompt, options)
    : callClaudeCli(input, systemPrompt, options);
