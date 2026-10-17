import { mkdtemp, mkdir, writeFile, symlink, rm, rename, unlink, open, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { openSessionFile, renderSessionFileText } from '@/lib/session-files';
import { buildSessionFileUrl } from '@/lib/session-file-url';
import { parseEditorFileLink } from '@/lib/editor-url';
import { getOpenedFilePath } from '@/lib/opened-file-path';

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>();
  return { ...fs, open: vi.fn(fs.open) };
});

vi.mock('@/lib/opened-file-path', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/opened-file-path')>();
  return { getOpenedFilePath: vi.fn(original.getOpenedFilePath) };
});

let directory: string;
let root: string;
const parts = (file: string) => file.split('/').filter(Boolean);

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'session-files-test-'));
  root = path.join(directory, 'repo');
  await mkdir(root);
  await mkdir(`${root}-other`);
  await writeFile(path.join(root, '中文 #?.md'), 'hello');
  await writeFile(path.join(directory, 'private.txt'), 'private');
  await writeFile(path.join(`${root}-other`, 'file.txt'), 'outside');
  await symlink(path.join(directory, 'private.txt'), path.join(root, 'escape.txt'));
  await symlink(path.join(root, '中文 #?.md'), path.join(root, 'inside.md'));
});
afterAll(async () => { await rm(directory, { recursive: true, force: true }); });
afterEach(() => vi.clearAllMocks());

describe('session file path boundary', () => {
  it('fails closed and releases the file when descriptor verification is unavailable', async () => {
    vi.mocked(getOpenedFilePath).mockRejectedValueOnce(new Error('Descriptor path unavailable'));
    await expect(openSessionFile(parts(path.join(root, '中文 #?.md')), [root])).rejects.toMatchObject({ status: 503 });
    const handle = await vi.mocked(open).mock.results[0].value as FileHandle;
    await expect(handle.stat()).rejects.toMatchObject({ code: 'EBADF' });
  });

  it('accepts both the configured symlink and its real workspace path', async () => {
    const alias = path.join(directory, 'workspace-link');
    await symlink(root, alias);
    for (const target of [alias, root]) {
      const file = await openSessionFile(parts(path.join(target, '中文 #?.md')), [alias]);
      try { expect(await file.handle.readFile('utf8')).toBe('hello'); }
      finally { await file.handle.close(); }
    }
  });

  it.each([false, true])('rejects a parent swapped before open, restored afterwards: %s', async (restoreBeforeCheck) => {
    const parent = path.join(root, `nested-${restoreBeforeCheck}`);
    const saved = `${parent}-saved`;
    await mkdir(parent);
    await writeFile(path.join(parent, 'file.txt'), 'inside');
    const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
    let opened: FileHandle | undefined;
    let returned: Awaited<ReturnType<typeof openSessionFile>> | undefined;
    vi.mocked(open).mockImplementationOnce(async (...args) => {
      await rename(parent, saved);
      await symlink(`${root}-other`, parent);
      opened = await fs.open(...args);
      if (restoreBeforeCheck) {
        await unlink(parent);
        await rename(saved, parent);
      }
      return opened;
    });
    try {
      await expect(openSessionFile(parts(path.join(parent, 'file.txt')), [root]).then((file) => {
        returned = file;
        return file;
      })).rejects.toMatchObject({ status: 403 });
      expect(opened).toBeDefined();
      await expect(opened!.stat()).rejects.toMatchObject({ code: 'EBADF' });
    } finally {
      await returned?.handle.close();
    }
  });

  it('opens encoded-name targets and symlinks within the allowed root', async () => {
    for (const name of ['中文 #?.md', 'inside.md']) {
      const file = await openSessionFile(parts(path.join(root, name)), [root]);
      try { expect(await file.handle.readFile('utf8')).toBe('hello'); }
      finally { await file.handle.close(); }
    }
  });

  it.each(['escape.txt', '../repo-other/file.txt', '../private.txt'])('rejects %s', async (name) => {
    await expect(openSessionFile(parts(path.resolve(root, name)), [root])).rejects.toMatchObject({ status: 403 });
  });

  it.each([[], ['tmp', '..', 'etc', 'passwd'], ['tmp', 'a/b'], ['tmp', 'a\\b'], ['tmp', '\0'], undefined])(
    'rejects malformed decoded segments: %j', async (segments) => {
      await expect(openSessionFile(segments, [root])).rejects.toMatchObject({ status: 400 });
    },
  );

  it('rejects directories and reports missing files', async () => {
    await expect(openSessionFile(parts(root), [root])).rejects.toMatchObject({ status: 404 });
    await expect(openSessionFile(parts(path.join(root, 'gone.txt')), [root])).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('browser file content and URL', () => {
  it('keeps the absolute path encoded once and separates the line fragment', () => {
    const file = parseEditorFileLink('../中文%20%23%3F.md:12:3', '/repo/sub')!;
    expect(buildSessionFileUrl(file)).toBe('/api/session-files/repo/%E4%B8%AD%E6%96%87%20%23%3F.md?view=1#L12');
  });

  it('escapes filename and source markup while preserving whitespace and line anchors', () => {
    const html = renderSessionFileText('<img>.md', '  first\n<script>alert(1)</script>\n');
    expect(html).toContain('<title>&lt;img&gt;.md</title>');
    expect(html).toContain('<span id="L1">  first\n</span>');
    expect(html).toContain('<span id="L2">&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('width=device-width');
  });
});
