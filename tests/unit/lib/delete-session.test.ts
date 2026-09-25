import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  statuses: {} as Record<string, unknown>,
  codex: vi.fn(async () => {}),
  clearCache: vi.fn(),
  running: vi.fn(async () => false),
  readdir: vi.fn(),
  lstat: vi.fn(),
  readFile: vi.fn(),
  realpath: vi.fn(async (file: string) => file),
  unlink: vi.fn(async () => {}),
  rm: vi.fn(async () => {}),
}));
vi.mock('os', () => ({ default: { homedir: () => '/test-home' } }));
vi.mock('fs/promises', () => ({ default: { readdir: mocks.readdir, lstat: mocks.lstat, readFile: mocks.readFile, realpath: mocks.realpath, unlink: mocks.unlink, rm: mocks.rm } }));
vi.mock('@/lib/status-manager', () => ({ getStatusManager: () => ({ getAllForClient: () => mocks.statuses }) }));
vi.mock('@/lib/process-utils', () => ({ isProcessRunning: mocks.running }));
vi.mock('@/lib/delete-codex-session', () => ({ deleteCodexSession: mocks.codex }));
vi.mock('@/lib/codex-session-list', () => ({ clearCodexSessionListCache: mocks.clearCache }));
import { deleteOriginalSession, SessionInUseError } from '@/lib/delete-session';

const missing = () => Object.assign(new Error('Missing'), { code: 'ENOENT' });
const stat = (directory = false, symlink = false) => ({ isFile: () => !directory, isDirectory: () => directory, isSymbolicLink: () => symlink });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.statuses = {};
  mocks.readdir.mockImplementation(async (file: string) => file.endsWith('/sessions') ? [] : [{ name: 'project', isDirectory: () => true }]);
  mocks.lstat.mockImplementation(async (file: string) => file.endsWith('.jsonl') ? stat() : stat(true));
});

describe('delete original tool session', () => {
  it('uses native Codex deletion and clears cached session metadata', async () => {
    await deleteOriginalSession('codex', 'id-1');
    expect(mocks.codex).toHaveBeenCalledExactlyOnceWith('id-1');
    expect(mocks.clearCache).toHaveBeenCalledOnce();
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
  it.each(['busy', 'idle', 'needs-input', 'unknown'])('blocks a tracked %s session', async (cliState) => {
    mocks.statuses = { tab: { agentProviderId: 'codex', agentSessionId: 'id-1', cliState } };
    await expect(deleteOriginalSession('codex', 'id-1')).rejects.toBeInstanceOf(SessionInUseError);
    expect(mocks.codex).not.toHaveBeenCalled();
  });
  it('removes only the selected Claude transcript and its own subdirectory', async () => {
    await deleteOriginalSession('claude', 'id-1');
    expect(mocks.rm).toHaveBeenCalledExactlyOnceWith('/test-home/.claude/projects/project/id-1', { recursive: true });
    expect(mocks.unlink).toHaveBeenCalledExactlyOnceWith('/test-home/.claude/projects/project/id-1.jsonl');
  });
  it('also protects Claude sessions running outside workspace tabs', async () => {
    mocks.readdir.mockResolvedValueOnce(['123.json']);
    mocks.readFile.mockResolvedValueOnce(JSON.stringify({ sessionId: 'id-1', pid: 123 }));
    mocks.running.mockResolvedValueOnce(true);
    await expect(deleteOriginalSession('claude', 'id-1')).rejects.toBeInstanceOf(SessionInUseError);
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
  it('refuses path traversal before any tool or filesystem mutation', async () => {
    await expect(deleteOriginalSession('claude', '../outside')).rejects.toThrow('Invalid session ID');
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.rm).not.toHaveBeenCalled();
  });
  it('refuses symbolic link transcripts and session directories', async () => {
    mocks.lstat.mockResolvedValueOnce(stat(false, true));
    await expect(deleteOriginalSession('claude', 'id-1')).rejects.toThrow('Unsafe session path');
    mocks.lstat.mockResolvedValueOnce(stat()).mockResolvedValueOnce(stat(true, true));
    await expect(deleteOriginalSession('claude', 'id-1')).rejects.toThrow('Unsafe session directory');
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.rm).not.toHaveBeenCalled();
  });
  it('allows already missing Claude transcripts without touching unrelated paths', async () => {
    mocks.lstat.mockRejectedValueOnce(missing());
    await deleteOriginalSession('claude', 'id-1');
    expect(mocks.unlink).not.toHaveBeenCalled();
    expect(mocks.rm).not.toHaveBeenCalled();
  });
});
