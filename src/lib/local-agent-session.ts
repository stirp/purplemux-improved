import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getProcessOpenFiles } from '@/lib/process-utils';
import { findCodexSessionById, readCodexSessionMeta } from '@/lib/providers/codex/session-detection';
import { toClaudeProjectName } from '@/lib/providers/claude/session-detection';
import type { IAgentProcessSession, TLocalAgent } from '@/types/agent-process';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export { classifyAgentArgv } from '@/lib/agent-process-identity';

export const resolveLocalAgentSession = async (
  pid: number, providerId: TLocalAgent, cwd: string, argv: string[], startedAt: string,
): Promise<IAgentProcessSession | null> => {
  const root = path.join(os.homedir(), providerId === 'codex' ? '.codex' : '.claude');
  const candidates = new Map<string, IAgentProcessSession>();
  const addClaude = async (sessionId: string, directory: string) => {
    if (!UUID.test(sessionId)) return;
    const jsonlPath = path.join(root, 'projects', toClaudeProjectName(directory), `${sessionId}.jsonl`);
    try {
      await fs.access(jsonlPath, fs.constants.R_OK);
      candidates.set(sessionId, { sessionId, jsonlPath });
    } catch { /* A session without a readable transcript cannot be resumed here. */ }
  };
  for (const file of new Set(await getProcessOpenFiles(pid))) {
    if (!file.startsWith(path.join(root, providerId === 'codex' ? 'sessions' : 'projects') + path.sep) || !file.endsWith('.jsonl')) continue;
    if (providerId === 'codex') {
      const meta = await readCodexSessionMeta(file);
      if (meta && !meta.isSubagent && UUID.test(meta.sessionId) && meta.cwd === cwd) {
        candidates.set(meta.sessionId, { sessionId: meta.sessionId, jsonlPath: file });
      }
    } else if (path.dirname(file) === path.join(root, 'projects', toClaudeProjectName(cwd))) {
      await addClaude(path.basename(file, '.jsonl'), cwd);
    }
  }
  if (providerId === 'claude') {
    const directory = path.join(root, 'sessions');
    const names = await fs.readdir(directory).catch(() => [] as string[]);
    await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
      try {
        const data = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
        if (data.pid === pid && data.cwd === cwd && typeof data.startedAt === 'number'
          && data.startedAt >= Date.parse(startedAt) && typeof data.sessionId === 'string') {
          await addClaude(data.sessionId, cwd);
        }
      } catch { /* PID files may disappear while a process exits. */ }
    }));
  }
  // Open files and PID registration reflect the current session after /new or /clear.
  if (candidates.size) return candidates.size === 1 ? [...candidates.values()][0] : null;
  const flag = providerId === 'codex' ? 'resume' : '--resume';
  const index = argv.indexOf(flag);
  const sessionId = index >= 0 ? argv[index + 1] : undefined;
  if (!sessionId || !UUID.test(sessionId)) return null;
  if (providerId === 'codex') {
    const meta = await findCodexSessionById(sessionId);
    return meta && !meta.isSubagent && meta.cwd === cwd ? { sessionId, jsonlPath: meta.jsonlPath } : null;
  }
  await addClaude(sessionId, cwd);
  return candidates.get(sessionId) ?? null;
};
