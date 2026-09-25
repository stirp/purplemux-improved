import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { getStatusManager } from '@/lib/status-manager';
import { isProcessRunning } from '@/lib/process-utils';
import { deleteCodexSession } from '@/lib/delete-codex-session';
import { clearCodexSessionListCache } from '@/lib/codex-session-list';

export class SessionInUseError extends Error {
  constructor() { super('Session is in use'); }
}

const assertNotInUse = (provider: 'claude' | 'codex', sessionId: string) => {
  const active = Object.values(getStatusManager().getAllForClient()).some((tab) =>
    (tab.agentProviderId ?? (tab.panelType === 'codex-cli' ? 'codex' : 'claude')) === provider
      && tab.agentSessionId === sessionId && tab.cliState !== 'inactive',
  );
  if (active) throw new SessionInUseError();
};

const assertClaudeNotRunning = async (claudeRoot: string, sessionId: string) => {
  const sessionsDir = path.join(claudeRoot, 'sessions');
  let files: string[];
  try { files = await fs.readdir(sessionsDir); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  for (const file of files.filter((name) => name.endsWith('.json'))) {
    let session: { sessionId?: string; pid?: number };
    try { session = JSON.parse(await fs.readFile(path.join(sessionsDir, file), 'utf8')); } catch { continue; }
    if (session.sessionId === sessionId && typeof session.pid === 'number' && await isProcessRunning(session.pid)) {
      throw new SessionInUseError();
    }
  }
};

const removeClaudeSession = async (sessionId: string) => {
  const claudeRoot = path.join(os.homedir(), '.claude');
  await assertClaudeNotRunning(claudeRoot, sessionId);
  let root: string;
  try { root = await fs.realpath(path.join(claudeRoot, 'projects')); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const projects = await fs.readdir(root, { withFileTypes: true });
  for (const project of projects) {
    if (!project.isDirectory()) continue;
    const directory = path.join(root, project.name);
    const transcript = path.join(directory, `${sessionId}.jsonl`);
    let stat;
    try { stat = await fs.lstat(transcript); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    if (!stat.isFile() || stat.isSymbolicLink() || await fs.realpath(directory) !== directory) {
      throw new Error('Unsafe session path');
    }
    // Subagent transcripts and tool results are stored in the session's own directory.
    const sessionDirectory = path.join(directory, sessionId);
    let sessionStat;
    try { sessionStat = await fs.lstat(sessionDirectory); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (sessionStat && (!sessionStat.isDirectory() || sessionStat.isSymbolicLink())) throw new Error('Unsafe session directory');
    assertNotInUse('claude', sessionId);
    if (sessionStat) await fs.rm(sessionDirectory, { recursive: true });
    await fs.unlink(transcript);
  }
};

export const deleteOriginalSession = async (provider: 'claude' | 'codex', sessionId: string): Promise<void> => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sessionId)) throw new Error('Invalid session ID');
  assertNotInUse(provider, sessionId);
  if (provider === 'codex') {
    await deleteCodexSession(sessionId);
    clearCodexSessionListCache();
  } else {
    await removeClaudeSession(sessionId);
  }
};
