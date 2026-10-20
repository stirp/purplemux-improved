import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { NextApiRequest, NextApiResponse } from 'next';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import workspaceDiff from '@/pages/api/layout/diff';
import commitDiff from '@/pages/api/layout/commit-diff';
import { getDisplayName, parseMultiFileDiff } from '@/lib/parse-git-diff';

const mocks = vi.hoisted(() => ({ cwd: vi.fn() }));
vi.mock('@/lib/tmux', () => ({ getSessionCwd: mocks.cwd, hasSession: async () => true }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ warn: vi.fn(), error: vi.fn() }) }));

const exec = promisify(execFile);
let directory: string;
let baseConfig: string;
let rootHash: string;
let currentHash: string;
const binaryPaths = ['a/image.bin', 'i/image.bin', 'w/image.bin'];
const textPath = 'b/readme.txt';
const git = async (...args: string[]) => (await exec('git', ['-C', directory, ...args])).stdout.trim();

const writeTrackedFiles = async (version: number) => {
  for (const name of binaryPaths) {
    await fs.writeFile(path.join(directory, name), Buffer.from([0, version]));
  }
  await fs.writeFile(path.join(directory, textPath), `version ${version}\n`);
};

beforeAll(async () => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1');
  vi.stubEnv('GIT_CONFIG_COUNT', '0');
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-diff-prefix-'));
  mocks.cwd.mockResolvedValue(directory);
  await git('init', '-b', 'main');
  await git('config', 'user.name', 'Test');
  await git('config', 'user.email', 'test@example.invalid');
  await git('config', 'commit.gpgsign', 'false');
  await git('config', 'core.hooksPath', '/dev/null');
  for (const folder of ['a', 'b', 'i', 'w', 'u']) {
    await fs.mkdir(path.join(directory, folder));
  }
  await writeTrackedFiles(1);
  await git('add', '.');
  await git('commit', '-m', 'Root fixture');
  rootHash = await git('rev-parse', 'HEAD');
  await writeTrackedFiles(2);
  await git('add', '.');
  await git('commit', '-m', 'Updated fixture');
  currentHash = await git('rev-parse', 'HEAD');
  await writeTrackedFiles(3);
  await fs.writeFile(path.join(directory, 'u/new.bin'), Buffer.from([0, 4]));
  baseConfig = await fs.readFile(path.join(directory, '.git/config'), 'utf8');
});

afterAll(async () => {
  vi.unstubAllEnvs();
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

const call = async (handler: typeof workspaceDiff, hash?: string) => {
  const response = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  response.status.mockReturnValue(response);
  await handler({ method: 'GET', query: { session: 'fixture', ...(hash ? { hash } : {}) } } as unknown as NextApiRequest,
    response as unknown as NextApiResponse);
  expect(response.status).toHaveBeenCalledWith(200);
  return (response.json.mock.calls[0][0] as { diff: string }).diff;
};

describe.each([
  ['default', ''],
  ['no prefix', '\n[diff]\n\tnoprefix = true\n'],
  ['mnemonic prefix', '\n[diff]\n\tmnemonicPrefix = true\n'],
  ['both enabled', '\n[diff]\n\tnoprefix = true\n\tmnemonicPrefix = true\n'],
  ['custom prefixes', '\n[diff]\n\tsrcPrefix = old/\n\tdstPrefix = new/\n'],
])('Git diff API with %s configuration', (_name, config) => {
  beforeEach(async () => {
    await fs.writeFile(path.join(directory, '.git/config'), baseConfig + config);
  });

  const checkDiff = (diff: string, isRoot: boolean, untracked: boolean) => {
    const files = parseMultiFileDiff(diff);
    expect(files.map(getDisplayName).sort()).toEqual([...binaryPaths, textPath, ...(untracked ? ['u/new.bin'] : [])].sort());
    for (const file of files) {
      const name = getDisplayName(file);
      const isNew = isRoot || name === 'u/new.bin';
      expect(file.oldName).toBe(isNew ? '/dev/null' : name);
      expect(file.newName).toBe(name);
      expect(file.isNew).toBe(isNew);
      expect(file.isBinary).toBe(name !== textPath);
      if (name === textPath) {
        expect(file.oldHeaderLine).toBe(isRoot ? '--- /dev/null' : '--- a/b/readme.txt');
        expect(file.newHeaderLine).toBe('+++ b/b/readme.txt');
        expect(file.additions).toBe(1);
        expect(file.deletions).toBe(isRoot ? 0 : 1);
      }
    }
  };

  it('preserves tracked and untracked workspace paths', async () => {
    checkDiff(await call(workspaceDiff), false, true);
    expect(await fs.readFile(path.join(directory, '.git/config'), 'utf8')).toBe(baseConfig + config);
  });

  it.each([false, true])('preserves historical paths (root=%s)', async (isRoot) => {
    checkDiff(await call(commitDiff, isRoot ? rootHash : currentHash), isRoot, false);
    expect(await fs.readFile(path.join(directory, '.git/config'), 'utf8')).toBe(baseConfig + config);
  });
});
