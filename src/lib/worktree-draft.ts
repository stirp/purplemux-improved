import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { worktreeGit } from '@/lib/worktree-git';
import { resolveWorktreeItem, WorktreeError } from '@/lib/worktree-manager';
import { getWorktreeReviewRemotes, parseReviewResponse, parseReviewUrl } from '@/lib/worktree-delivery';
import { updateWorktreeMetadata, worktreeMetadataKey } from '@/lib/worktree-metadata';
import type { IWorkspace } from '@/types/terminal';
import type { IWorktreeDraftOptions, IWorktreeDraftResult, IWorktreeReview, TWorktreeSnapshot } from '@/types/worktree';

const exec = promisify(execFile);
const prepare = async (source: IWorkspace, snapshot: TWorktreeSnapshot, remote: string) => {
  const { item } = await resolveWorktreeItem(source, snapshot.repositoryId, snapshot.directory);
  if (item.head !== snapshot.head || item.branch !== snapshot.branch) throw new WorktreeError('changed');
  if (!item.branch) throw new WorktreeError('detached');
  const blocker = item.blockers.find((reason) => !['ignored', 'sessions', 'sharedWorkspace'].includes(reason));
  if (blocker) throw new WorktreeError(blocker);
  const selected = (await getWorktreeReviewRemotes(item.directory)).find((entry) => entry.name === remote);
  if (!selected) throw new WorktreeError('reviewRemote', 400);
  // Read from the push destination too: fetch and push URLs may refer to different repositories.
  const pushUrl = (await worktreeGit(item.directory, ['remote', 'get-url', '--push', remote])).trim();
  return { item, selected, pushUrl };
};

export const pushWorktreeBranch = async (source: IWorkspace, snapshot: TWorktreeSnapshot, remote: string) => {
  const { item, pushUrl } = await prepare(source, snapshot, remote);
  try {
    await worktreeGit(item.directory, ['-c', 'push.followTags=false', 'push', '--verify', '--', pushUrl, `${item.head}:refs/heads/${item.branch}`], 60_000);
  } catch { throw new WorktreeError('pushFailed'); }
  return { ok: true };
};

export const createWorktreeDraft = async (source: IWorkspace, snapshot: TWorktreeSnapshot, options: IWorktreeDraftOptions): Promise<IWorktreeDraftResult> => {
  const { item, selected, pushUrl } = await prepare(source, snapshot, options.remote);
  if (options.targetBranch === item.branch || options.targetBranch.startsWith('-')) throw new WorktreeError('targetRequired', 400);
  try { await worktreeGit(item.directory, ['check-ref-format', `refs/heads/${options.targetBranch}`]); }
  catch { throw new WorktreeError('targetRequired', 400); }
  let remoteHeads: string;
  try { remoteHeads = await worktreeGit(item.directory, ['ls-remote', '--heads', '--', pushUrl, `refs/heads/${item.branch}`, `refs/heads/${options.targetBranch}`], 30_000); }
  catch { throw new WorktreeError('reviewUnavailable'); }
  const refs = new Map(remoteHeads.trim().split('\n').map((line) => { const [head, ref] = line.split('\t'); return [ref, head]; }));
  if (refs.get(`refs/heads/${item.branch}`) !== item.head) throw new WorktreeError('branchNotPublished');
  if (!refs.has(`refs/heads/${options.targetBranch}`)) throw new WorktreeError('targetNotPublished');

  const cli = options.provider === 'github' ? 'gh' : 'glab';
  const run = (args: string[]) => exec(cli, args, { cwd: item.directory, timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: '1', GIT_TERMINAL_PROMPT: '0', GLAB_CHECK_UPDATE: 'false' } });
  const listArgs = options.provider === 'github'
    ? ['pr', 'list', '--repo', selected.repository, '--head', item.branch!, '--base', options.targetBranch, '--state', 'open', '--json', 'url,title,state,isDraft,headRefName,headRefOid,baseRefName,isCrossRepository']
    : ['mr', 'list', '--repo', selected.repository, '--source-branch', item.branch!, '--target-branch', options.targetBranch, '--output', 'json'];
  const validateLink = (url: string) => {
    const parsed = parseReviewUrl(url);
    if (parsed.provider !== options.provider || `https://${parsed.host}/${parsed.project}` !== selected.repository) throw new WorktreeError('reviewMismatch');
    return parsed.url;
  };
  let existing: IWorktreeReview | undefined;
  try {
    const data: unknown = JSON.parse((await run(listArgs)).stdout);
    if (!Array.isArray(data)) throw new Error('Invalid review list');
    for (const entry of data) {
      if (entry.isCrossRepository || (entry.source_project_id && entry.target_project_id && entry.source_project_id !== entry.target_project_id)) continue;
      const link = validateLink(options.provider === 'github' ? entry.url : entry.web_url);
      const review = parseReviewResponse(options.provider, entry, link);
      if (review.sourceBranch === item.branch && review.targetBranch === options.targetBranch && ['open', 'draft'].includes(review.state)) { existing = review; break; }
    }
  } catch (error) { throw new WorktreeError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'reviewCliMissing' : 'reviewUnavailable'); }

  let review = existing;
  if (!review) {
    const temporary = await mkdtemp(path.join(tmpdir(), 'purplemux-draft-'));
    try {
      const bodyFile = path.join(temporary, 'body.md');
      await writeFile(bodyFile, options.body, { mode: 0o600 });
      const args = options.provider === 'github'
        ? ['pr', 'create', '--repo', selected.repository, '--head', item.branch!, '--base', options.targetBranch, '--title', options.title, '--body-file', bodyFile, '--draft']
        : ['mr', 'create', '--repo', selected.repository, '--source-branch', item.branch!, '--target-branch', options.targetBranch, '--title', options.title, '--description', options.body, '--draft', '--yes', '--no-editor'];
      const { stdout } = await run(args);
      const links = stdout.match(/https:\/\/[^\s\x1b]+/g) ?? [];
      const link = links.map((url) => { try { return validateLink(url); } catch { return null; } }).find(Boolean);
      if (!link) throw new Error('Missing created review URL');
      review = { url: link, provider: options.provider, state: 'draft', title: options.title, head: item.head,
        sourceBranch: item.branch!, targetBranch: options.targetBranch, checkedAt: new Date().toISOString() };
    } catch (error) {
      throw new WorktreeError((error as NodeJS.ErrnoException).code === 'ENOENT' ? 'reviewCliMissing' : 'draftCreateFailed');
    } finally { await rm(temporary, { recursive: true, force: true }).catch(() => undefined); }
  }
  try { await updateWorktreeMetadata(worktreeMetadataKey(snapshot.repositoryId, item.directory, item.branch), { review }); }
  catch { return { review, existing: !!existing, warning: 'draftAssociationFailed' }; }
  return { review, existing: !!existing };
};
