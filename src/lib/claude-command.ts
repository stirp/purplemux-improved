import { getDangerouslySkipPermissions } from '@/lib/config-store';
import { HOOK_SETTINGS_PATH } from '@/lib/hook-settings';
import { getClaudePromptPath } from '@/lib/claude-prompt';
import { buildClaudeLauncherCommand } from '@/lib/providers/claude/launcher';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidSessionId = (id: unknown): id is string =>
  typeof id === 'string' && UUID_RE.test(id);

export const buildClaudeArgs = async (workspaceId?: string): Promise<string[]> => {
  const skipPerms = await getDangerouslySkipPermissions();
  const parts = ['--settings', HOOK_SETTINGS_PATH];
  if (workspaceId) {
    parts.push('--append-system-prompt-file', getClaudePromptPath(workspaceId));
  }
  if (skipPerms) parts.push('--dangerously-skip-permissions');
  return parts;
};

export const buildResumeCommand = async (sessionId: string, workspaceId?: string): Promise<string> => {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session ID format: ${sessionId}`);
  }
  const args = await buildClaudeArgs(workspaceId);
  return buildClaudeLauncherCommand(['--resume', sessionId, ...args]);
};
