import path from 'path';
import fs from 'fs/promises';
import { getProcessArgv } from '@/lib/process-utils';
import type { TLocalAgent } from '@/types/agent-process';

export const classifyAgentArgv = (argv: string[]): TLocalAgent | null => {
  const executable = path.basename(argv[0] ?? '');
  if (executable === 'claude' || executable === 'codex') return executable;
  if (!/^(node|nodejs|bun)$/.test(executable)) return null;
  const script = argv[1] ?? '';
  if (/(?:^|\/)@anthropic-ai\/claude-code\/(?:cli|claude)\.js$/.test(script)) return 'claude';
  if (/(?:^|\/)@openai\/codex\/bin\/codex\.js$/.test(script)) return 'codex';
  return null;
};

export const resolveAgentArgv = async (argv: string[]): Promise<TLocalAgent | null> => {
  const detected = classifyAgentArgv(argv);
  if (detected) return detected;
  if (!/^(node|nodejs|bun)$/.test(path.basename(argv[0] ?? '')) || !path.isAbsolute(argv[1] ?? '')) return null;
  try {
    // npm bin links keep their alias in argv; identify the actual package script.
    const script = await fs.realpath(argv[1]);
    return classifyAgentArgv([argv[0], script]);
  } catch {
    return null;
  }
};

export const matchesAgentProcess = async (pid: number, args: string, provider: TLocalAgent): Promise<boolean> =>
  await resolveAgentArgv(await getProcessArgv({ pid, args })) === provider;
