import { mkdtemp, mkdir, open, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getOpenedFilePath } from '@/lib/opened-file-path';

let directory: string;
beforeAll(async () => {
  directory = await realpath(await mkdtemp(path.join(tmpdir(), 'opened-file-path-')));
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });

describe('native descriptor paths on Linux and macOS', () => {
  it('returns the real path of an open file with a Unicode name', async () => {
    const filename = path.join(directory, '中文 # report.md');
    await writeFile(filename, 'report');
    const file = await open(filename, 'r');
    try { expect(await getOpenedFilePath(file.fd)).toBe(filename); }
    finally { await file.close(); }
  });

  it('tracks the open file after its parent is renamed and replaced by a symlink', async () => {
    const parent = path.join(directory, 'original');
    const renamed = path.join(directory, 'renamed');
    const outside = path.join(directory, 'other');
    await mkdir(parent);
    await mkdir(outside);
    await writeFile(path.join(parent, 'file.txt'), 'original');
    await writeFile(path.join(outside, 'file.txt'), 'replacement');
    const file = await open(path.join(parent, 'file.txt'), 'r');
    try {
      await rename(parent, renamed);
      await symlink(outside, parent);
      expect(await getOpenedFilePath(file.fd)).toBe(path.join(renamed, 'file.txt'));
      expect(await file.readFile('utf8')).toBe('original');
    } finally {
      await file.close();
    }
  });

  it('rejects a closed descriptor', async () => {
    const filename = path.join(directory, 'closed.txt');
    await writeFile(filename, 'closed');
    const file = await open(filename, 'r');
    const fd = file.fd;
    await file.close();
    await expect(getOpenedFilePath(fd)).rejects.toThrow();
  });
});
