import { setTimeout as delay } from 'timers/promises';
import { getProcessArgv, listUserProcesses, type ISystemProcess } from '@/lib/process-utils';
import { classifyAgentArgv } from '@/lib/local-agent-session';
import type { TLocalAgent } from '@/types/agent-process';

const sameProcess = (a: ISystemProcess, b: ISystemProcess) =>
  a.pid === b.pid && a.startedAt === b.startedAt && a.ppid === b.ppid && a.args === b.args;

export const stopIdleAgentChain = async (chain: ISystemProcess[], providerId: TLocalAgent): Promise<void> => {
  const agents: ISystemProcess[] = [];
  for (const item of chain) {
    if (classifyAgentArgv(await getProcessArgv(item)) === providerId) agents.push(item);
  }
  const leaf = chain.at(-1);
  if (!leaf || agents.at(-1)?.pid !== leaf.pid) throw new Error('Agent identity changed before shutdown');
  const inspect = async () => {
    const processes = await listUserProcesses();
    const related = new Set(chain.map((item) => item.pid));
    // Include children created during shutdown, even if their original parent has exited.
    for (let size = -1; size !== related.size;) {
      size = related.size;
      for (const item of processes) if (related.has(item.ppid)) related.add(item.pid);
    }
    const live = processes.filter((item) => related.has(item.pid));
    if (live.some((item) => !chain.some((old) => sameProcess(old, item)))) {
      throw new Error('Terminal process tree changed; terminal retained');
    }
    return live;
  };
  const initial = await inspect();
  if (initial.length !== chain.length) throw new Error('Terminal process tree changed before shutdown');
  // Leave the shell and tmux alive until every agent/launcher has actually exited.
  try { process.kill(leaf.pid, 'SIGTERM'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
  const deadline = Date.now() + 10000;
  for (let attempt = 0; attempt < 40 && Date.now() < deadline; attempt++) {
    const live = await inspect();
    if (!live.some((item) => agents.some((agent) => sameProcess(agent, item)))) return;
    await delay(250);
  }
  throw new Error('Agent processes have not stopped; terminal and tab retained');
};
