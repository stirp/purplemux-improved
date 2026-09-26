import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { worktreeGit } from '@/lib/worktree-git';
import { resolveWorktreeItem, WorktreeError } from '@/lib/worktree-manager';
import { readWorktreeMetadata, updateWorktreeMetadata, worktreeMetadataKey } from '@/lib/worktree-metadata';
import type { IWorkspace } from '@/types/terminal';
import type { IWorktreeReview, TWorktreeSnapshot } from '@/types/worktree';

const exec = promisify(execFile);
export const parseReviewUrl = (value: string) => {
  let url: URL;
  try { url = new URL(value); } catch { throw new WorktreeError('reviewUrl', 400); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new WorktreeError('reviewUrl', 400);
  const match = /^\/(.+?)\/(pull|\-\/merge_requests)\/([1-9]\d*)\/?$/.exec(url.pathname);
  if (!match || /%|\.\.|\\/.test(match[1])) throw new WorktreeError('reviewUrl', 400);
  const provider = match[2] === 'pull' ? 'github' as const : 'gitlab' as const;
  return { provider, host: url.host, project: match[1], number: match[3], url: `${url.origin}/${match[1]}/${match[2]}/${match[3]}` };
};

const remoteIdentity = (value: string) => {
  try {
    const scp = /^[^/@\s]+@([^/:]+):(.+)$/.exec(value);
    const url = new URL(scp ? `ssh://${scp[1]}/${scp[2]}` : value);
    if (!['https:', 'http:', 'ssh:', 'git:'].includes(url.protocol) || !url.host) return null;
    return `${url.host.toLowerCase()}/${url.pathname.replace(/^\//, '').replace(/\.git\/?$/, '').replace(/\/$/, '')}`;
  } catch { return null; }
};

export const getWorktreeReviewRemotes = async (directory: string) => {
  const names = (await worktreeGit(directory, ['remote'])).trim().split('\n').filter((name) => name && !name.startsWith('-'));
  const entries = await Promise.all(names.map(async (name) => {
    const urls = (await worktreeGit(directory, ['remote', 'get-url', '--push', '--all', name])).trim().split('\n');
    const identity = urls.length === 1 ? remoteIdentity(urls[0]) : null;
    return identity ? [{ name, repository: `https://${identity}` }] : [];
  }));
  return entries.flat();
};

const validateReviewRemote = async (directory: string, value: string) => {
  const review = parseReviewUrl(value);
  const names = (await worktreeGit(directory, ['remote'])).trim().split('\n').filter(Boolean);
  const urls = await Promise.all(names.flatMap((name) => [worktreeGit(directory, ['remote', 'get-url', '--all', name]), worktreeGit(directory, ['remote', 'get-url', '--push', '--all', name])]));
  const expected = `${review.host.toLowerCase()}/${review.project}`;
  if (!urls.flatMap((output) => output.trim().split('\n')).some((url) => remoteIdentity(url) === expected)) throw new WorktreeError('reviewRemote', 400);
  return review;
};

export const parseReviewResponse = (provider: 'github' | 'gitlab', data: Record<string, unknown>, link: string): IWorktreeReview => {
  const state = String(data.state ?? '').toLowerCase();
  if (!['open', 'opened', 'merged', 'closed'].includes(state)) throw new Error('Invalid review state');
  const sourceBranch = provider === 'github' ? data.headRefName : data.source_branch;
  const targetBranch = provider === 'github' ? data.baseRefName : data.target_branch;
  const head = provider === 'github' ? data.headRefOid : (data.diff_refs as { head_sha?: string } | undefined)?.head_sha ?? data.sha;
  const url = provider === 'github' ? data.url : data.web_url;
  if (typeof sourceBranch !== 'string' || typeof targetBranch !== 'string' || typeof head !== 'string'
    || typeof url !== 'string' || parseReviewUrl(url).url !== link) throw new Error('Invalid review response');
  const draft = provider === 'github' ? data.isDraft : data.draft ?? data.work_in_progress;
  return { provider, url: link, state: state === 'merged' ? 'merged' : state === 'closed' ? 'closed' : draft ? 'draft' : 'open',
    sourceBranch, targetBranch, head, title: typeof data.title === 'string' ? data.title : '', checkedAt: new Date().toISOString() };
};

export const saveWorktreeReview = async (source: IWorkspace, snapshot: TWorktreeSnapshot, url: string | null) => {
  const { item } = await resolveWorktreeItem(source, snapshot.repositoryId, snapshot.directory);
  if (item.branch !== snapshot.branch || item.head !== snapshot.head) throw new WorktreeError('changed');
  const key = worktreeMetadataKey(snapshot.repositoryId, item.directory, item.branch);
  let review: IWorktreeReview | undefined;
  if (url) {
    const parsed = await validateReviewRemote(item.directory, url);
    review = { provider: parsed.provider, url: parsed.url, state: 'unknown' };
  }
  await updateWorktreeMetadata(key, { review });
  return review ?? null;
};

export const refreshWorktreeReview = async (source: IWorkspace, snapshot: TWorktreeSnapshot) => {
  const { item } = await resolveWorktreeItem(source, snapshot.repositoryId, snapshot.directory);
  if (item.branch !== snapshot.branch) throw new WorktreeError('changed');
  const key = worktreeMetadataKey(snapshot.repositoryId, item.directory, item.branch);
  const saved = (await readWorktreeMetadata(key)).review;
  if (!saved) throw new WorktreeError('reviewMissing', 400);
  const parsed = await validateReviewRemote(item.directory, saved.url);
  let review: IWorktreeReview;
  try {
    const args = parsed.provider === 'github'
      ? ['pr', 'view', parsed.url, '--json', 'url,title,state,isDraft,headRefName,headRefOid,baseRefName']
      : ['mr', 'view', parsed.number, '--repo', `https://${parsed.host}/${parsed.project}`, '--output', 'json'];
    const { stdout } = await exec(parsed.provider === 'github' ? 'gh' : 'glab', args, {
      cwd: item.directory, timeout: 20_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', GLAB_CHECK_UPDATE: 'false' },
    });
    review = parseReviewResponse(parsed.provider, JSON.parse(stdout), parsed.url);
    if (review.sourceBranch !== item.branch) review = { ...review, state: 'unknown', error: 'reviewMismatch' };
  } catch (error) {
    review = { ...saved, state: 'unknown', error: (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'reviewCliMissing' : 'reviewUnavailable' };
  }
  await updateWorktreeMetadata(key, { review });
  return review;
};
