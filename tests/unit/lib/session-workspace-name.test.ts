import { describe, expect, it } from 'vitest';
import { sessionRootWorkspaceName, sessionWorkspaceName } from '@/lib/session-workspace-name';
import type { IWorkSession } from '@/lib/session-workflow';

const session: IWorkSession = {
  key: 'codex:s1', workspaceId: 'ws', tabId: 't', status: 'pending', olderEntries: [],
  navigation: { workspaceId: 'ws', workspaceName: 'Archived project', workspaceDir: '/code/archived/', tabId: 't', providerId: 'codex', agentSessionId: 's1' },
};

describe('Session project names', () => {
  const root = { id: 'root', name: 'Root project', directories: ['/root'] };
  const child = { id: 'ws', name: 'Child project', directories: ['/child'], parentWorkspaceId: 'middle' };
  const middle = { id: 'middle', name: 'Middle project', directories: [], parentWorkspaceId: 'root' };

  it('resolves the root through multiple parents and updates after renames', () => {
    expect(sessionRootWorkspaceName(session, [root, middle, child])).toBe('Root project');
    expect(sessionRootWorkspaceName(session, [{ ...root, name: 'Renamed root' }, middle, child])).toBe('Renamed root');
    expect(sessionRootWorkspaceName(session, [{ ...child, parentWorkspaceId: undefined }])).toBe('Child project');
  });

  it('does not borrow the child history name when the root name is blank', () => {
    expect(sessionRootWorkspaceName(session, [{ ...root, name: ' ' }, middle, child])).toBe('root');
    expect(sessionRootWorkspaceName(session, [{ ...root, name: '', directories: [] }, middle, child])).toBe('root');
  });

  it('returns unknown for missing roots and cycles instead of inventing a parent', () => {
    expect(sessionRootWorkspaceName(session, [])).toBeNull();
    expect(sessionRootWorkspaceName(session, [child])).toBeNull();
    expect(sessionRootWorkspaceName(session, [child, { ...middle, parentWorkspaceId: 'ws' }])).toBeNull();
    expect(sessionRootWorkspaceName(session, [{ ...child, parentWorkspaceId: 'ws' }])).toBeNull();
  });

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
