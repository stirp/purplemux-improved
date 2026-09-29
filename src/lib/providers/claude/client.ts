// Hook settings path mirrors HOOK_SETTINGS_PATH (lib/hook-settings.ts) and
// the workspace prompt path mirrors getClaudePromptPath (lib/claude-prompt.ts).
// Kept literal here because this module runs in the browser and cannot import
// node-only modules. Update both sides together if those paths move.

import { buildClaudeLauncherCommand } from '@/lib/providers/claude/launcher';

interface IBuildClaudeLaunchCommandOptions {
  workspaceId?: string | null;
  dangerouslySkipPermissions?: boolean;
  resumeSessionId?: string | null;
}

export const buildClaudeLaunchCommand = ({
  workspaceId,
  dangerouslySkipPermissions,
  resumeSessionId,
}: IBuildClaudeLaunchCommandOptions): string => {
  const parts: string[] = [];
  if (resumeSessionId) parts.push('--resume', resumeSessionId);
  parts.push('--settings', '~/.purplemux/hooks.json');
  if (workspaceId) {
    parts.push('--append-system-prompt-file', `~/.purplemux/workspaces/${workspaceId}/claude-prompt.md`);
  }
  if (dangerouslySkipPermissions) parts.push('--dangerously-skip-permissions');
  return buildClaudeLauncherCommand(parts);
};
