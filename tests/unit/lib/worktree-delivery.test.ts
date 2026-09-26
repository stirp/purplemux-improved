import fs from 'node:fs/promises';
import { createWorktreeDraft, pushWorktreeBranch } from '@/lib/worktree-draft';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ exec: vi.fn(), git: vi.fn(), resolve: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: mocks.exec }) }));
vi.mock('@/lib/worktree-git', () => ({ worktreeGit: mocks.git }));
vi.mock('@/lib/worktree-manager', async (original) => ({ ...await original<typeof import('@/lib/worktree-manager')>(), resolveWorktreeItem: mocks.resolve }));
vi.mock('@/lib/worktree-metadata', () => ({ readWorktreeMetadata: mocks.read, updateWorktreeMetadata: mocks.save, worktreeMetadataKey: () => 'fixture' }));
import { parseReviewUrl, parseReviewResponse, saveWorktreeReview, refreshWorktreeReview } from '@/lib/worktree-delivery';
const source = { id: 'ws-source', name: 'Source', directories: ['/repo'] };
const item = { repositoryId: '/repo/.git', directory: '/task', head: 'a'.repeat(40), branch: 'task/one' };
const url = 'https://github.com/owner/repo/pull/123';
const github = { url, state: 'OPEN', title: 'Task', isDraft: false, headRefName: item.branch, headRefOid: item.head, baseRefName: 'main' };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.resolve.mockResolvedValue({ item: { ...item, status: {}, workspaces: [], blockers: [] } });
  mocks.git.mockImplementation(async (_cwd, args) => args.length === 1 ? 'origin\n' : 'git@github.com:owner/repo.git\n');
  mocks.read.mockResolvedValue({ review: { provider: 'github', url, state: 'merged', checkedAt: '2025-01-01T00:00:00Z' } });
  mocks.exec.mockResolvedValue({ stdout: JSON.stringify(github) });
});
describe('PR/MR association', () => {
  it('accepts supported links but rejects credentials, unsafe schemes, queries, and malformed paths', () => {
    expect(parseReviewUrl(url)).toMatchObject({ provider: 'github', project: 'owner/repo', number: '123' });
    expect(parseReviewUrl('https://git.example.test/group/sub/repo/-/merge_requests/7')).toMatchObject({ provider: 'gitlab', project: 'group/sub/repo' });
    for (const bad of ['javascript:alert(1)', 'https://token@github.com/owner/repo/pull/1', `${url}?token=x`, 'https://github.com/owner/repo/issues/1']) expect(() => parseReviewUrl(bad)).toThrow();
  });
  it('only persists links to configured remotes, supports unlinking, and rejects stale branch snapshots', async () => {
    expect(await saveWorktreeReview(source, item, url)).toMatchObject({ url, state: 'unknown' });
    await expect(saveWorktreeReview(source, item, 'https://other.test/owner/repo/pull/123')).rejects.toMatchObject({ code: 'reviewRemote' });
    expect(await saveWorktreeReview(source, item, null)).toBeNull();
    expect(mocks.save).toHaveBeenLastCalledWith('fixture', { review: undefined });
    await expect(saveWorktreeReview(source, { ...item, branch: 'other' }, url)).rejects.toMatchObject({ code: 'changed' });
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('refreshes through the provider CLI using structured arguments and validates the source branch', async () => {
    expect(await refreshWorktreeReview(source, item)).toMatchObject({ state: 'open', head: item.head, sourceBranch: item.branch });
    expect(mocks.exec.mock.calls[0][0]).toBe('gh');
    expect(mocks.exec.mock.calls[0][1]).toContain(url);
    mocks.exec.mockResolvedValue({ stdout: JSON.stringify({ ...github, headRefName: 'somebody-else' }) });
    expect(await refreshWorktreeReview(source, item)).toMatchObject({ state: 'unknown', error: 'reviewMismatch' });
  });
  it('turns unavailable CLI or network evidence into unknown, never a previously cached merged state', async () => {
    mocks.exec.mockRejectedValue({ code: 'ENOENT' });
    expect(await refreshWorktreeReview(source, item)).toMatchObject({ state: 'unknown', error: 'reviewCliMissing', checkedAt: '2025-01-01T00:00:00Z' });
    mocks.exec.mockRejectedValue(new Error('authentication failed'));
    expect(await refreshWorktreeReview(source, item)).toMatchObject({ state: 'unknown', error: 'reviewUnavailable' });
  });
  it('maps GitLab draft/merged state and requires the returned URL to match', () => {
    const link = 'https://git.example.test/team/repo/-/merge_requests/4';
    const data = { web_url: link, state: 'opened', draft: true, source_branch: 'task/one', target_branch: 'main', diff_refs: { head_sha: item.head } };
    expect(parseReviewResponse('gitlab', data, link)).toMatchObject({ state: 'draft', head: item.head });
    expect(parseReviewResponse('gitlab', { ...data, state: 'merged' }, link)).toMatchObject({ state: 'merged' });
    expect(() => parseReviewResponse('gitlab', { ...data, web_url: link + '0' }, link)).toThrow();
    expect(() => parseReviewResponse('gitlab', { ...data, state: 'unexpected' }, link)).toThrow();
  });
});


describe('draft creation and explicit publishing', () => {
  const options = { remote: 'origin', provider: 'github' as const, targetBranch: 'main', title: 'A title', body: 'First line\n\n`literal` $value' };
  beforeEach(() => {
    mocks.git.mockImplementation(async (_cwd, args) => {
      if (args[0] === 'remote') return args.length === 1 ? 'origin\n' : 'git@github.com:owner/repo.git\n';
      if (args[0] === 'ls-remote') return `${item.head}\trefs/heads/${item.branch}\n${'b'.repeat(40)}\trefs/heads/main\n`;
      return '';
    });
    mocks.exec.mockImplementation(async (_cli, args) => ({ stdout: args[1] === 'list' ? '[]' : url }));
  });
  it('checks publication and creates a GitHub draft with literal body content and no implicit push', async () => {
    let bodyFile = '';
    mocks.exec.mockImplementation(async (_cli, args) => {
      if (args[1] === 'list') return { stdout: '[]' };
      bodyFile = args[args.indexOf('--body-file') + 1];
      expect(await fs.readFile(bodyFile, 'utf8')).toBe(options.body);
      return { stdout: url + '\n' };
    });
    expect(await createWorktreeDraft(source, item, options)).toMatchObject({ existing: false, review: { url, state: 'draft', head: item.head } });
    const args = mocks.exec.mock.calls[1][1];
    expect(args).toEqual(expect.arrayContaining(['--draft', '--head', item.branch, '--base', 'main']));
    expect(args).not.toContain('--fill');
    expect(mocks.git.mock.calls.some(([, args]) => args.includes('push'))).toBe(false);
    await expect(fs.stat(bodyFile)).rejects.toThrow();
  });
  it('links existing open reviews without creating another one or converting it to a draft', async () => {
    mocks.exec.mockResolvedValue({ stdout: JSON.stringify([github]) });
    expect(await createWorktreeDraft(source, item, options)).toMatchObject({ existing: true, review: { state: 'open', url } });
    expect(mocks.exec).toHaveBeenCalledTimes(1);
    expect(mocks.exec.mock.calls[0][1]).toContain('list');
  });
  it('rejects unpublished source commits, missing target branches, and changed worktrees before any hosted write', async () => {
    const original = mocks.git.getMockImplementation()!;
    mocks.git.mockImplementation(async (cwd, args) => args[0] === 'ls-remote' ? `${'b'.repeat(40)}\trefs/heads/main\n` : original(cwd, args));
    await expect(createWorktreeDraft(source, item, options)).rejects.toMatchObject({ code: 'branchNotPublished' });
    mocks.git.mockImplementation(async (cwd, args) => args[0] === 'ls-remote' ? `${item.head}\trefs/heads/${item.branch}\n` : original(cwd, args));
    await expect(createWorktreeDraft(source, item, options)).rejects.toMatchObject({ code: 'targetNotPublished' });
    await expect(createWorktreeDraft(source, { ...item, head: 'b'.repeat(40) }, options)).rejects.toMatchObject({ code: 'changed' });
    expect(mocks.exec).not.toHaveBeenCalled();
  });
  it('retains the created URL when local association fails and does not repeat the hosted write', async () => {
    mocks.save.mockRejectedValue(new Error('disk full'));
    expect(await createWorktreeDraft(source, item, options)).toMatchObject({ review: { url }, warning: 'draftAssociationFailed' });
    expect(mocks.exec.mock.calls.filter(([, args]) => args[1] === 'create')).toHaveLength(1);
  });
  it('reports unavailable lookup or uncertain creation without automatic write retries', async () => {
    mocks.exec.mockRejectedValueOnce({ code: 'ENOENT' });
    await expect(createWorktreeDraft(source, item, options)).rejects.toMatchObject({ code: 'reviewCliMissing' });
    mocks.exec.mockResolvedValueOnce({ stdout: '[]' }).mockRejectedValueOnce(new Error('network timeout'));
    await expect(createWorktreeDraft(source, item, options)).rejects.toMatchObject({ code: 'draftCreateFailed' });
    expect(mocks.exec.mock.calls.filter(([, args]) => args[1] === 'create')).toHaveLength(1);
  });
  it('creates GitLab drafts with explicit branches, no editor, and no fill/push options', async () => {
    const link = 'https://github.com/owner/repo/-/merge_requests/7';
    mocks.exec.mockResolvedValueOnce({ stdout: '[]' }).mockResolvedValueOnce({ stdout: `Creating merge request\n${link}\n` });
    expect(await createWorktreeDraft(source, item, { ...options, provider: 'gitlab' })).toMatchObject({ review: { url: link, provider: 'gitlab', state: 'draft' } });
    const [cli, args] = mocks.exec.mock.calls[1];
    expect(cli).toBe('glab');
    expect(args).toEqual(expect.arrayContaining(['--draft', '--yes', '--no-editor', '--description', options.body]));
    expect(args).not.toContain('--push'); expect(args).not.toContain('--fill');
  });
  it('pushes the exact previewed commit with no force and retains hook verification', async () => {
    expect(await pushWorktreeBranch(source, item, 'origin')).toEqual({ ok: true });
    const args = mocks.git.mock.calls.find(([, args]) => args.includes('push'))![1];
    expect(args).toContain(`${item.head}:refs/heads/${item.branch}`);
    expect(args).toContain('--verify');
    expect(args).not.toContain('--force'); expect(args).not.toContain('--force-with-lease');
    expect(mocks.exec).not.toHaveBeenCalled();
  });
});
