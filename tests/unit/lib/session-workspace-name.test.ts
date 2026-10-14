import { describe, expect, it } from 'vitest';
import { sessionWorkspaceName } from '@/lib/session-workspace-name';
import type { IWorkSession } from '@/lib/session-workflow';

const session: IWorkSession = {
  key: 'codex:s1', workspaceId: 'ws', tabId: 't', status: 'pending', olderEntries: [],
  navigation: { workspaceId: 'ws', workspaceName: 'Archived project', workspaceDir: '/code/archived/', tabId: 't', providerId: 'codex', agentSessionId: 's1' },
};

describe('Session project names', () => {
  it('prefers the current name and skips blank current names', () => {
    expect(sessionWorkspaceName(session, { id: 'ws', name: ' Renamed project ', directories: [] })).toBe('Renamed project');
    expect(sessionWorkspaceName(session, { id: 'ws', name: '   ', directories: [] })).toBe('Archived project');
  });

  it.each(['/code/project-name/', 'C:\\code\\project-name\\'])(
    'uses the directory name when only an ID placeholder remains: %s', (workspaceDir) => {
      expect(sessionWorkspaceName({ ...session, navigation: { ...session.navigation!, workspaceName: 'ws', workspaceDir } })).toBe('project-name');
    },
  );

  it('uses the workspace ID only when names and directories are absent', () => {
    expect(sessionWorkspaceName({ ...session, navigation: undefined })).toBe('ws');
    expect(sessionWorkspaceName({ ...session, workspaceId: '', navigation: undefined })).toBeNull();
  });
});
