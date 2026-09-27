import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import { getShellPath } from '@/lib/preflight';
import type { TAgentProvider } from '@/lib/config-store';

interface IAgentTextOptions {
  cwd?: string;
  environment?: Record<string, string>;
  textOnly?: boolean;
}

const callClaudeCli = async (input: string, systemPrompt: string, options: IAgentTextOptions): Promise<string> => {
  const resolvedPath = await getShellPath();
  const directory = options.textOnly ? await fs.mkdtemp(path.join(os.tmpdir(), 'purplemux-text-only-')) : undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      const child = execFile(
        'claude',
        ['-p', ...(options.textOnly ? [
          '--bare', '--tools', '', '--disallowedTools', '*',
          '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}',
          '--no-session-persistence', '--output-format', 'text',
        ] : [])],
        { timeout: 120_000, maxBuffer: 1024 * 1024, cwd: directory ?? options.cwd, env: { ...process.env, PATH: resolvedPath, ...options.environment } },
        (error, stdout) => {
          if (error) {
            reject(new Error(`claude -p failed: ${error.message}`));
            return;
          }
          resolve(stdout.trim());
        },
      );
      child.stdin?.write(`${systemPrompt}\n\n${input}`);
      child.stdin?.end();
    });
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
