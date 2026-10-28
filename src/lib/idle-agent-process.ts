import path from 'path';
import { resolveAgentArgv } from '@/lib/agent-process-identity';
import { getProcessArgv, type ISystemProcess } from '@/lib/process-utils';
import { CLAUDE_LAUNCHER_BOOTSTRAP } from '@/lib/providers/claude/launcher';
import { isLegacyClaudeLauncher } from '@/lib/legacy-claude-launcher';
import { CODEX_LAUNCHER_SCRIPT } from '@/lib/providers/codex/launcher-path';
import type { TLocalAgent } from '@/types/agent-process';

export const getIdleAgentProcessRole = async (
  item: ISystemProcess, providerId: TLocalAgent,
): Promise<'shell' | 'launcher' | 'codex-wrapper' | 'agent' | null> => {
  const argv = await getProcessArgv(item);
  const executable = path.basename(argv[0] ?? '');
  if (/^(bash|zsh|sh|fish|dash|ksh)$/.test(executable)) return 'shell';
  if (/^(node|nodejs|bun)$/.test(executable)) {
    if (providerId === 'codex' && argv[1] === CODEX_LAUNCHER_SCRIPT) return 'launcher';
    if (providerId === 'claude' && argv[1] === '-e'
      && (argv[2] === CLAUDE_LAUNCHER_BOOTSTRAP || isLegacyClaudeLauncher(argv[2]))) return 'launcher';
    const agent = await resolveAgentArgv(argv);
    if (agent !== providerId) return null;
    return agent === 'codex' ? 'codex-wrapper' : 'agent';
  }
  return await resolveAgentArgv(argv) === providerId ? 'agent' : null;
};

export const idleAgentProcessChain = async (
  rootPid: number, processes: ISystemProcess[], providerId: TLocalAgent,
): Promise<ISystemProcess[] | null> => {
  const chain: ISystemProcess[] = [];
  let current = processes.find((item) => item.pid === rootPid);
  let requiresNativeCodex = false;
  while (current && chain.length < 32) {
    if (chain.some((item) => item.pid === current!.pid)) return null;
    const role = await getIdleAgentProcessRole(current, providerId);
    if (!role || (requiresNativeCodex && role !== 'agent')) return null;
    chain.push(current);
    const children = processes.filter((item) => item.ppid === current!.pid);
    if (!children.length) return role === 'agent' ? chain : null;
    if (children.length !== 1 || role === 'agent') return null;
    if (role === 'codex-wrapper') {
      const argv = await getProcessArgv(children[0]);
      if (path.basename(argv[0] ?? '') !== 'codex') return null;
      requiresNativeCodex = true;
    }
    current = children[0];
  }
  return null;
};
