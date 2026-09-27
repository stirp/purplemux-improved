import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ agent: vi.fn(), config: vi.fn() }));
vi.mock('@/lib/agent-text', () => ({ callAgentText: mocks.agent }));
vi.mock('@/lib/config-store', () => ({ getConfig: mocks.config }));
import { commitStagedChanges, generateCommitMessage, inspectCommit } from '@/lib/git-commit';

const exec = promisify(execFile);
let directory: string;
const git = async (...args: string[]) => (await exec('git', ['-C', directory, ...args])).stdout.trim();
const stage = async (name: string, content: string) => {
  await fs.writeFile(path.join(directory, name), content);
  await git('add', '--', name);
};
const message = { title: 'feat: staged changes', body: 'Literal `code` and $(echo no)\n\nDetails.' };
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

describe('AI commit messages and adopting staged changes', () => {
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
  it('generates only from staged content, then commits the edited message while preserving unstaged and untracked files', async () => {
    await stage('file.txt', 'staged content\n');
    await fs.writeFile(path.join(directory, 'file.txt'), 'unstaged secret\n');
    await fs.writeFile(path.join(directory, 'private.txt'), 'untracked secret');
    const generated = await generateCommitMessage(directory, 'zh-CN');
    expect(generated.files).toEqual(['file.txt']);
    const [provider, prompt, , options] = mocks.agent.mock.calls[0];
    expect(provider).toBe('claude'); expect(options).toEqual({ textOnly: true });
    expect(JSON.parse(prompt)).toMatchObject({ locale: 'zh-CN', truncated: false });
    expect(prompt).toContain('staged content'); expect(prompt).not.toContain('secret');
    const edited = { ...message, title: 'fix: edited by user' };
    const result = await commitStagedChanges(directory, generated.snapshot, edited);
    expect(result.warning).toBeUndefined();
    expect(result.head).toBe(await git('rev-parse', 'HEAD'));
    expect(await git('log', '-1', '--format=%B')).toBe(`${edited.title}\n\n${edited.body}`);
    expect(await git('show', 'HEAD:file.txt')).toBe('staged content');
    expect(await git('diff', '--cached')).toBe('');
    expect(await fs.readFile(path.join(directory, 'file.txt'), 'utf8')).toBe('unstaged secret\n');
    expect(await fs.readFile(path.join(directory, 'private.txt'), 'utf8')).toBe('untracked secret');
    expect(await fs.readdir(path.join(directory, '.git'))).not.toEqual(expect.arrayContaining(['index.lock']));
    expect((await fs.readdir(path.join(directory, '.git'))).some((name) => name.startsWith('purplemux-commit-'))).toBe(false);
    await expect(commitStagedChanges(directory, generated.snapshot, edited)).rejects.toBeDefined();
    expect(await git('rev-list', '--count', 'HEAD')).toBe('2');
  });

  it('rejects changed staged content before committing', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    await stage('file.txt', 'two');
    await expect(commitStagedChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'changed' });
    expect(await git('rev-parse', 'HEAD')).toBe(snapshot.head);
    expect(await git('show', ':file.txt')).toBe('two');
  });

  it('rejects changed HEAD, branch, and repository identity', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    await git('checkout', '-b', 'other');
    await expect(commitStagedChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'changed' });
    await git('checkout', 'main');
    await git('commit', '--allow-empty', '--only', '-m', 'Other commit');
    await expect(commitStagedChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'changed' });
    await expect(commitStagedChanges(directory, { ...snapshot, directory: '/another' }, message)).rejects.toMatchObject({ code: 'changed' });
  });

  it('keeps existing index locks intact', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    const lock = path.join(directory, '.git', 'index.lock');
    await fs.writeFile(lock, 'other operation');
    await expect(commitStagedChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'locked' });
    expect(await fs.readFile(lock, 'utf8')).toBe('other operation');
    expect(await git('rev-parse', 'HEAD')).toBe(snapshot.head);
  });

  it('allows at most one commit when two requests adopt the same snapshot concurrently', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    const results = await Promise.allSettled([
      commitStagedChanges(directory, snapshot, message),
      commitStagedChanges(directory, snapshot, message),
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
    await expect(commitStagedChanges(directory, snapshot, message)).rejects.toMatchObject({ code: 'commitFailed', message: expect.stringContaining('test hook rejected') });
    expect(await git('rev-parse', 'HEAD')).toBe(snapshot.head);
    expect(await git('write-tree')).toBe(snapshot.tree);
    await fs.rm(hook);
    expect((await commitStagedChanges(directory, snapshot, message)).head).not.toBe(snapshot.head);
  });

  it('keeps hook-staged changes consistent with the resulting commit', async () => {
    await stage('file.txt', 'one');
    const { snapshot } = await inspectCommit(directory);
    await fs.writeFile(path.join(directory, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nprintf "formatted" > file.txt\ngit add file.txt\n', { mode: 0o755 });
    await commitStagedChanges(directory, snapshot, message);
    expect(await git('show', 'HEAD:file.txt')).toBe('formatted');
    expect(await git('status', '--porcelain')).toBe('');
  });

  it('supports the initial commit and worktrees with their own index', async () => {
    const parent = directory;
    const child = path.join(directory, 'linked');
    await git('worktree', 'add', '-b', 'task', child);
    directory = child;
    try {
      await stage('file.txt', 'child');
      const generated = await generateCommitMessage(directory, 'en');
      await commitStagedChanges(directory, generated.snapshot, message);
      expect(await git('status', '--porcelain')).toBe('');
      expect((await exec('git', ['-C', parent, 'show', 'HEAD:file.txt'])).stdout.trim()).toBe('base');
      await git('checkout', '--orphan', 'first');
      const initial = await inspectCommit(directory);
      expect(initial.snapshot.head).toBeNull();
      await commitStagedChanges(directory, initial.snapshot, message);
      expect(await git('rev-list', '--count', 'HEAD')).toBe('1');
    } finally { directory = parent; }
  });

  it('blocks empty staging, detached HEAD, and operations before calling AI', async () => {
    await expect(generateCommitMessage(directory, 'en')).rejects.toMatchObject({ code: 'noStagedChanges' });
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
