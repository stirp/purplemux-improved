import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import handler from '@/pages/api/workspace/directories';

const request = async (directory: unknown, method = 'GET') => {
  let status = 200;
  let body: { directory?: string; parent?: string; directories?: { name: string; path: string; hidden: boolean }[] } = {};
  const res = {
    setHeader() {},
    status(value: number) { status = value; return this; },
    json(value: typeof body) { body = value; return this; },
  };
  await handler({ method, query: { directory } } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return { status, body };
};

describe('workspace directory browser', () => {
  it('lists real directories, hidden directories and directory symlinks, excluding files', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pmux-browser-'));
    try {
      await fs.mkdir(path.join(dir, 'project'));
      await fs.mkdir(path.join(dir, '.hidden'));
      await fs.writeFile(path.join(dir, 'file.txt'), 'test');
      await fs.symlink(path.join(dir, 'project'), path.join(dir, 'linked'));
      await fs.symlink(path.join(dir, 'missing'), path.join(dir, 'broken'));
      const result = await request(dir);
      expect(result.status).toBe(200);
      expect(result.body.directory).toBe(dir);
      expect(result.body.parent).toBe(path.dirname(dir));
      expect(result.body.directories).toHaveLength(3);
      expect(result.body.directories).toContainEqual({ name: '.hidden', path: path.join(dir, '.hidden'), hidden: true });
      expect(result.body.directories).toContainEqual({ name: 'linked', path: path.join(dir, 'linked'), hidden: false });
      expect((await request(path.join(dir, 'missing'))).status).toBe(404);
      expect((await request(path.join(dir, 'file.txt'))).status).toBe(404);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
  it('rejects relative paths, repeated parameters and writes', async () => {
    expect((await request('relative')).status).toBe(400);
    expect((await request(['/tmp', '/'])).status).toBe(400);
    expect((await request('/tmp', 'POST')).status).toBe(405);
  });
});
