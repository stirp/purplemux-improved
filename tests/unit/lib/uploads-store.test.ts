import path from 'path';
import fs from 'fs/promises';
import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveUploadImagePath,
  uploadPathToImageUrl,
  UPLOADS_DIR,
  getUploadImageHash,
} from '@/lib/uploads-store';

afterEach(() => vi.restoreAllMocks());

describe('upload image identity', () => {
  it('hashes uploaded bytes and rejects a symlink escaping the uploads root', async () => {
    const file = path.join(UPLOADS_DIR, 'ws', 'tab', 'image.png');
    const data = Buffer.from('image bytes');
    const realpath = vi.spyOn(fs, 'realpath').mockResolvedValue(file);
    vi.spyOn(fs, 'stat').mockResolvedValue({ size: data.length } as Awaited<ReturnType<typeof fs.stat>>);
    const read = vi.spyOn(fs, 'readFile').mockResolvedValue(data);
    expect(await getUploadImageHash(file)).toBe(createHash('sha256').update(data).digest('hex'));
    realpath.mockResolvedValue('/outside/image.png');
    await expect(getUploadImageHash(file)).rejects.toThrow('Invalid upload path');
    expect(read).toHaveBeenCalledTimes(1);
    expect(await getUploadImageHash('/outside/image.png')).toBeUndefined();
  });
});

describe('uploadPathToImageUrl', () => {
  it('converts an uploaded image path to an API URL', () => {
    const imagePath = path.join(UPLOADS_DIR, 'ws-1', 'tab-1', 'image name.png');

    expect(uploadPathToImageUrl(imagePath)).toBe('/api/uploads/ws-1/tab-1/image%20name.png');
  });

  it('rejects paths outside the uploads directory', () => {
    expect(uploadPathToImageUrl('/tmp/image.png')).toBeNull();
  });

  it('rejects non-image uploads', () => {
    const filePath = path.join(UPLOADS_DIR, 'ws-1', 'tab-1', 'notes.txt');

    expect(uploadPathToImageUrl(filePath)).toBeNull();
  });
});

describe('resolveUploadImagePath', () => {
  it('resolves safe upload URL segments', () => {
    const expected = path.join(UPLOADS_DIR, 'ws-1', 'tab-1', 'image.png');

    expect(resolveUploadImagePath(['ws-1', 'tab-1', 'image.png'])).toBe(expected);
  });

  it('rejects traversal segments', () => {
    expect(resolveUploadImagePath(['ws-1', '..', 'image.png'])).toBeNull();
  });

  it('rejects non-image segments', () => {
    expect(resolveUploadImagePath(['ws-1', 'tab-1', 'notes.txt'])).toBeNull();
  });
});
