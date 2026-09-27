import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
const mocks = vi.hoisted(() => ({ exists: vi.fn(), cwd: vi.fn(), inspect: vi.fn(), generate: vi.fn(), commit: vi.fn() }));
vi.mock('@/lib/tmux', () => ({ hasSession: mocks.exists, getSessionCwd: mocks.cwd }));
vi.mock('@/lib/git-commit', async (original) => ({
  ...await original<typeof import('@/lib/git-commit')>(),
  inspectCommit: mocks.inspect, generateCommitMessage: mocks.generate, commitWorkingChanges: mocks.commit,
}));
import handler from '@/pages/api/git/commit';
import { GitCommitError } from '@/lib/git-commit';

const snapshot = { directory: '/repo', branch: 'refs/heads/main', head: 'a'.repeat(40), tree: 'b'.repeat(40) };
const message = { title: 'feat: changes', body: 'Description' };
const call = async (body: object, method = 'POST') => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() }; res.status.mockReturnValue(res);
  await handler({ method, body: { session: 'pmux-test', ...body } } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => { vi.resetAllMocks(); mocks.exists.mockResolvedValue(true); mocks.cwd.mockResolvedValue('/repo'); });

describe('Git commit API', () => {
  it('keeps inspection and generation separate from committing', async () => {
    mocks.inspect.mockResolvedValue({ snapshot, files: ['file.txt'] });
    expect((await call({ action: 'inspect' })).json).toHaveBeenCalledWith({ snapshot, files: ['file.txt'] });
    mocks.generate.mockResolvedValue({ snapshot, ...message, truncated: false });
    expect((await call({ action: 'generate', locale: 'zh-CN' })).status).toHaveBeenCalledWith(200);
    expect(mocks.generate).toHaveBeenCalledWith('/repo', 'zh-CN');
    expect(mocks.commit).not.toHaveBeenCalled();
    await call({ action: 'commit', snapshot, message });
    expect(mocks.commit).toHaveBeenCalledWith('/repo', snapshot, message);
  });
  it('requires POST and validates snapshot, locale, and message boundaries before executing', async () => {
    expect((await call({}, 'GET')).status).toHaveBeenCalledWith(405);
    for (const request of [
      { action: 'generate', locale: 'invalid' },
      { action: 'commit', snapshot, message: { ...message, title: '  ' } },
      { action: 'commit', snapshot, message: { ...message, title: 'line\nbreak' } },
      { action: 'commit', snapshot, message: { ...message, body: 'x'.repeat(20001) } },
      { action: 'commit', snapshot: { ...snapshot, tree: 'HEAD' }, message },
      { action: 'commit', message },
    ]) expect((await call(request)).status).toHaveBeenCalledWith(400);
    expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('resolves the live session directory and refuses missing sessions', async () => {
    mocks.exists.mockResolvedValue(false);
    expect((await call({ action: 'inspect' })).status).toHaveBeenCalledWith(404);
    expect(mocks.cwd).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
    mocks.exists.mockResolvedValue(true); mocks.cwd.mockResolvedValue('/moved');
    await call({ action: 'commit', snapshot, message });
    expect(mocks.commit).toHaveBeenCalledWith('/moved', snapshot, message);
    mocks.cwd.mockResolvedValue(null);
    expect((await call({ action: 'inspect' })).status).toHaveBeenCalledWith(404);
  });
  it('returns stale snapshot errors and preserves successful commits with warnings', async () => {
    mocks.commit.mockRejectedValue(new GitCommitError('changed'));
    const rejected = await call({ action: 'commit', snapshot, message });
    expect(rejected.status).toHaveBeenCalledWith(409);
    expect(rejected.json).toHaveBeenCalledWith({ error: 'changed', code: 'changed' });
    const result = { head: 'c'.repeat(40), output: '', warning: 'indexUpdateFailed' };
    mocks.commit.mockResolvedValue(result);
    expect((await call({ action: 'commit', snapshot, message })).json).toHaveBeenCalledWith(result);
  });
});
