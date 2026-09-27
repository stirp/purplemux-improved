import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ agent: vi.fn(), config: vi.fn() }));
vi.mock('@/lib/agent-text', () => ({ callAgentText: mocks.agent }));
vi.mock('@/lib/config-store', () => ({ getConfig: mocks.config }));
import { commitWorkingChanges, generateCommitMessage, inspectCommit } from '@/lib/git-commit';

const exec = promisify(execFile);
let directory: string;
const git = async (...args: string[]) => (await exec('git', ['-C', directory, ...args])).stdout.trim();
const stage = async (name: string, content: string) => {
  await fs.writeFile(path.join(directory, name), content);
  await git('add', '--', name);
};
const message = { title: 'feat: working tree changes', body: 'Literal `code` and $(echo no)\n\nDetails.' };
beforeEach(async () => {
  vi.resetAllMocks();
  mocks.config.mockResolvedValue({});
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-commit-'));
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Test');
  await git('config', 'user.email', 'test@example.invalid');
  await git('config', 'commit.gpgsign', 'false');
  await stage('file.txt', 'base\n');
  await git('commit', '-m', 'Initial');
  mocks.agent.mockResolvedValue(JSON.stringify(message));
});
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

describe('AI commit messages and adopting working tree changes', () => {
  it('uses the latest saved commit prompt with rendered variables and preserves fixed output requirements', async () => {
    await stage('file.txt', 'one');
    mocks.config.mockResolvedValue({ commitMessagePrompt: 'Custom {{branch}} in {{locale}}: use conventional commits.' });
    await generateCommitMessage(directory, 'zh-CN');
    expect(mocks.agent.mock.calls[0][2]).toContain('Custom main in zh-CN: use conventional commits.');
    expect(mocks.agent.mock.calls[0][2]).toContain('Return only JSON');
    expect(mocks.agent.mock.calls[0][2]).toContain('Do not use tools.');
    mocks.config.mockResolvedValue({ commitMessagePrompt: 'New writing style.' });
    await generateCommitMessage(directory, 'en');
    expect(mocks.agent.mock.calls[1][2]).toContain('New writing style.');
    expect(JSON.parse(mocks.agent.mock.calls[1][1]).diff).toContain('one');
  });
  it('previews all changes without staging, then automatically stages and commits the latest working tree content', async () => {
    await stage('deleted.txt', 'remove me\n');
    await git('commit', '-m', 'Deletion fixture');
    await fs.appendFile(path.join(directory, '.git', 'info', 'exclude'), '\nignored.txt\n');
    await stage('file.txt', 'staged content\n');
    await stage('staged.txt', 'staged addition');
    await fs.writeFile(path.join(directory, 'file.txt'), 'unstaged content\n');
    await fs.writeFile(path.join(directory, 'new file.txt'), 'untracked addition');
    await fs.writeFile(path.join(directory, 'ignored.txt'), 'ignored secret');
    await fs.unlink(path.join(directory, 'deleted.txt'));
    const originalIndex = await fs.readFile(path.join(directory, '.git', 'index'));
    const generated = await generateCommitMessage(directory, 'zh-CN');
    expect(generated.files).toEqual(['deleted.txt', 'file.txt', 'new file.txt', 'staged.txt']);
    expect(await fs.readFile(path.join(directory, '.git', 'index'))).toEqual(originalIndex);
    const [provider, prompt, , options] = mocks.agent.mock.calls[0];
    expect(provider).toBe('claude'); expect(options).toEqual({ textOnly: true });
    expect(JSON.parse(prompt)).toMatchObject({ locale: 'zh-CN', truncated: false });
    const evidence = JSON.parse(prompt);
    expect(evidence.diff).toContain('+unstaged content');
    expect(evidence.diff).toContain('+staged addition');
    expect(evidence.diff).toContain('+untracked addition');
    expect(evidence.diff).toContain('-remove me');
    expect(evidence.diff).not.toContain('+staged content');
    expect(prompt).not.toContain('ignored secret');
    const edited = { ...message, title: 'fix: edited by user' };
    const result = await commitWorkingChanges(directory, generated.snapshot, edited);
    expect(result.warning).toBeUndefined();
    expect(result.head).toBe(await git('rev-parse', 'HEAD'));
    expect(await git('log', '-1', '--format=%B')).toBe(`${edited.title}\n\n${edited.body}`);
    expect(await git('show', 'HEAD:file.txt')).toBe('unstaged content');
    expect(await git('show', 'HEAD:staged.txt')).toBe('staged addition');
    expect(await git('show', 'HEAD:new file.txt')).toBe('untracked addition');
    await expect(git('show', 'HEAD:deleted.txt')).rejects.toThrow();
    await expect(git('show', 'HEAD:ignored.txt')).rejects.toThrow();
    expect(await git('diff', '--cached')).toBe('');
    expect(await git('status', '--porcelain')).toBe('');
    expect(await fs.readFile(path.join(directory, 'ignored.txt'), 'utf8')).toBe('ignored secret');
    expect(await fs.readdir(path.join(directory, '.git'))).not.toEqual(expect.arrayContaining(['index.lock']));
    expect((await fs.readdir(path.join(directory, '.git'))).some((name) => name.startsWith('purplemux-commit-'))).toBe(false);
    await expect(commitWorkingChanges(directory, generated.snapshot, edited)).rejects.toBeDefined();
    expect(await git('rev-list', '--count', 'HEAD')).toBe('3');
  });

  it.each(['tracked', 'untracked'])('generates and commits %s changes with an empty staging area', async (kind) => {
    const name = kind === 'tracked' ? 'file.txt' : 'new.txt';
    await fs.writeFile(path.join(directory, name), 'working content');
    const originalIndex = await fs.readFile(path.join(directory, '.git', 'index'));
    const generated = await generateCommitMessage(directory, 'en');
    expect(generated.files).toEqual([name]);
    expect(JSON.parse(mocks.agent.mock.calls[0][1]).diff).toContain('+working content');
    expect(await fs.readFile(path.join(directory, '.git', 'index'))).toEqual(originalIndex);
    await commitWorkingChanges(directory, generated.snapshot, message);
    expect(await git('show', `HEAD:${name}`)).toBe('working content');
    expect(await git('status', '--porcelain')).toBe('');
  });

  it('includes the entire repository when the terminal is in a subdirectory', async () => {
    const nested = path.join(directory, 'nested');
    await fs.mkdir(nested);
    await fs.writeFile(path.join(nested, 'new.txt'), 'nested content');
    await fs.writeFile(path.join(directory, 'file.txt'), 'root content');
    const generated = await generateCommitMessage(nested, 'en');
    expect(generated.snapshot.directory).toBe(directory);
    expect(generated.files).toEqual(['file.txt', 'nested/new.txt']);
    await commitWorkingChanges(nested, generated.snapshot, message);
    expect(await git('show', 'HEAD:file.txt')).toBe('root content');
    expect(await git('show', 'HEAD:nested/new.txt')).toBe('nested content');
    expect(await git('status', '--porcelain')).toBe('');
  });

  it('rejects changes reverted in the working tree without discarding existing staging', async () => {
    await stage('file.txt', 'staged change');
    await fs.writeFile(path.join(directory, 'file.txt'), 'base\n');
    const originalIndex = await fs.readFile(path.join(directory, '.git', 'index'));
    await expect(generateCommitMessage(directory, 'en')).rejects.toMatchObject({ code: 'noChanges' });
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(directory, '.git', 'index'))).toEqual(originalIndex);
  });

  it.each(['modify', 'add', 'delete'])('rejects a stale preview after a working tree %s without changing the real index', async (action) => {
    await stage('file.txt', 'staged version');
    await fs.writeFile(path.join(directory, 'file.txt'), 'preview version');
    const { snapshot } = await inspectCommit(directory);
    const originalIndex = await fs.readFile(path.join(directory, '.git', 'index'));
    if (action === 'modify') await fs.writeFile(path.join(directory, 'file.txt'), 'new version');
    else if (action === 'add') await fs.writeFile(path.join(directory, 'late.txt'), 'not previewed');
    else await fs.unlink(path.join(directory, 'file.txt'));
    await expect(commitWorkingChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'changed' });
    expect(await git('rev-parse', 'HEAD')).toBe(snapshot.head);
    expect(await fs.readFile(path.join(directory, '.git', 'index'))).toEqual(originalIndex);
  });

  it('supports a new repository with no index or commits', async () => {
    const parent = directory;
    directory = path.join(parent, 'new-repository');
    await fs.mkdir(directory);
    try {
      await git('init', '-b', 'main');
      await git('config', 'user.name', 'Test');
      await git('config', 'user.email', 'test@example.invalid');
      await git('config', 'commit.gpgsign', 'false');
      await fs.writeFile(path.join(directory, 'first.txt'), 'first content');
      const generated = await generateCommitMessage(directory, 'en');
      expect(generated.snapshot.head).toBeNull();
      expect(generated.files).toEqual(['first.txt']);
      await expect(fs.stat(path.join(directory, '.git', 'index'))).rejects.toMatchObject({ code: 'ENOENT' });
      await commitWorkingChanges(directory, generated.snapshot, message);
      expect(await git('show', 'HEAD:first.txt')).toBe('first content');
      expect(await git('rev-list', '--count', 'HEAD')).toBe('1');
      expect(await git('status', '--porcelain')).toBe('');
    } finally { directory = parent; }
  });

  it('keeps the original staged and unstaged split when a hook rejects automatic staging', async () => {
    await stage('file.txt', 'staged version');
    await fs.writeFile(path.join(directory, 'file.txt'), 'working version');
    const originalIndex = await fs.readFile(path.join(directory, '.git', 'index'));
    const { snapshot } = await inspectCommit(directory);
    await fs.writeFile(path.join(directory, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await expect(commitWorkingChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'commitFailed' });
    expect(await fs.readFile(path.join(directory, '.git', 'index'))).toEqual(originalIndex);
    expect(await git('show', ':file.txt')).toBe('staged version');
    expect(await fs.readFile(path.join(directory, 'file.txt'), 'utf8')).toBe('working version');
  });

  it('refuses unresolved index conflicts before automatic staging can mark them resolved', async () => {
    const base = await git('rev-parse', 'HEAD');
    await stage('file.txt', 'ours');
    await git('commit', '-m', 'Ours');
    await git('checkout', '--detach', base);
    await stage('file.txt', 'theirs');
    await git('commit', '-m', 'Theirs');
    const theirs = await git('rev-parse', 'HEAD');
    await git('checkout', 'main');
    await expect(git('merge', theirs)).rejects.toThrow();
    await fs.rm(path.join(directory, '.git', 'MERGE_HEAD'));
    const originalIndex = await fs.readFile(path.join(directory, '.git', 'index'));
    await expect(generateCommitMessage(directory, 'en')).rejects.toMatchObject({ code: 'conflicts' });
    expect(mocks.agent).not.toHaveBeenCalled();
    expect(await fs.readFile(path.join(directory, '.git', 'index'))).toEqual(originalIndex);
  });

  it('rejects changed staged content before committing', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    await stage('file.txt', 'two');
    await expect(commitWorkingChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'changed' });
    expect(await git('rev-parse', 'HEAD')).toBe(snapshot.head);
    expect(await git('show', ':file.txt')).toBe('two');
  });

  it('rejects changed HEAD, branch, and repository identity', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    await git('checkout', '-b', 'other');
    await expect(commitWorkingChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'changed' });
    await git('checkout', 'main');
    await git('commit', '--allow-empty', '--only', '-m', 'Other commit');
    await expect(commitWorkingChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'changed' });
    await expect(commitWorkingChanges(directory, { ...snapshot, directory: '/another' }, message)).rejects.toMatchObject({ code: 'changed' });
  });

  it('keeps existing index locks intact', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    const lock = path.join(directory, '.git', 'index.lock');
    await fs.writeFile(lock, 'other operation');
    await expect(commitWorkingChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'locked' });
    expect(await fs.readFile(lock, 'utf8')).toBe('other operation');
    expect(await git('rev-parse', 'HEAD')).toBe(snapshot.head);
  });

  it('allows at most one commit when two requests adopt the same snapshot concurrently', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    const results = await Promise.allSettled([
      commitWorkingChanges(directory, snapshot, message),
      commitWorkingChanges(directory, snapshot, message),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await git('rev-list', '--count', 'HEAD')).toBe('2');
    expect(await git('status', '--porcelain')).toBe('');
  });

  it('runs Git hooks, reports hook rejection, and preserves staged changes for retry', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    const hook = path.join(directory, '.git', 'hooks', 'pre-commit');
    await fs.writeFile(hook, '#!/bin/sh\necho "test hook rejected" >&2\nexit 1\n', { mode: 0o755 });
    await expect(commitWorkingChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'commitFailed', message: expect.stringContaining('test hook rejected') });
    expect(await git('rev-parse', 'HEAD')).toBe(snapshot.head);
    expect(await git('write-tree')).toBe(snapshot.tree);
    await fs.rm(hook);
    expect((await commitWorkingChanges(directory, snapshot, message)).head).not.toBe(snapshot.head);
  });

  it('keeps hook-staged changes consistent with the resulting commit', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    await fs.writeFile(path.join(directory, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nprintf "formatted" > file.txt\ngit add file.txt\n', { mode: 0o755 });
    await commitWorkingChanges(directory, snapshot, message);
    expect(await git('show', 'HEAD:file.txt')).toBe('formatted');
    expect(await git('status', '--porcelain')).toBe('');
  });

  it('supports the initial commit and worktrees with their own index', async () => {
    const parent = directory;
    const child = path.join(directory, 'linked');
    await git('worktree', 'add', '-b', 'task', child);
    directory = child;
    try {
      await fs.writeFile(path.join(directory, 'file.txt'), 'child');
      const generated = await generateCommitMessage(directory, 'en');
      await commitWorkingChanges(directory, generated.snapshot, message);
      expect(await git('status', '--porcelain')).toBe('');
      expect((await exec('git', ['-C', parent, 'show', 'HEAD:file.txt'])).stdout.trim()).toBe('base');
      await git('checkout', '--orphan', 'first');
      const initial = await inspectCommit(directory);
      expect(initial.snapshot.head).toBeNull();
      await commitWorkingChanges(directory, initial.snapshot, message);
      expect(await git('rev-list', '--count', 'HEAD')).toBe('1');
    } finally { directory = parent; }
  });

  it('blocks clean working trees, detached HEAD, and operations before calling AI', async () => {
    await expect(generateCommitMessage(directory, 'en')).rejects.toMatchObject({ code: 'noChanges' });
    await fs.appendFile(path.join(directory, '.git', 'info', 'exclude'), '\nignored.txt\n');
    await fs.writeFile(path.join(directory, 'ignored.txt'), 'ignored content');
    await expect(generateCommitMessage(directory, 'en')).rejects.toMatchObject({ code: 'noChanges' });
    await stage('file.txt', 'one');
    await git('checkout', '--detach');
    await expect(generateCommitMessage(directory, 'en')).rejects.toMatchObject({ code: 'detached' });
    await git('checkout', 'main');
    await fs.writeFile(path.join(directory, '.git', 'CHERRY_PICK_HEAD'), await git('rev-parse', 'HEAD'));
    await expect(generateCommitMessage(directory, 'en')).rejects.toMatchObject({ code: 'operation' });
    expect(mocks.agent).not.toHaveBeenCalled();
  });

  it('rejects malformed AI messages and marks truncated evidence', async () => {
    await stage('file.txt', 'x'.repeat(61000));
    const result = await generateCommitMessage(directory, 'en');
    expect(result.truncated).toBe(true);
    const evidence = JSON.parse(mocks.agent.mock.calls[0][1]);
    expect(evidence.truncated).toBe(true); expect(evidence.diff).toHaveLength(60000);
    mocks.agent.mockResolvedValue('{"title":"two\\nlines","body":""}');
    await expect(generateCommitMessage(directory, 'en')).rejects.toMatchObject({ code: 'invalidGeneration' });
  });
});
