import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOpenedFilePath } from '@/lib/opened-file-path';

const mocks = vi.hoisted(() => ({ platform: vi.fn(), readlink: vi.fn(), load: vi.fn(), func: vi.fn(), fcntl: vi.fn(), errno: vi.fn() }));
vi.mock('node:process', () => ({ getBuiltinModule: () => ({ platform: mocks.platform }) }));
vi.mock('node:fs/promises', () => ({ readlink: mocks.readlink }));
vi.mock('koffi', () => ({ default: { load: mocks.load, errno: mocks.errno } }));

const platform = (value: string) => mocks.platform.mockReturnValue(value);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.load.mockReturnValue({ func: mocks.func });
  mocks.func.mockReturnValue(mocks.fcntl);
  mocks.errno.mockReturnValue(9);
});

describe('opened file path platform adapter', () => {
  it('keeps Linux on procfs without loading a native library', async () => {
    platform('linux');
    mocks.readlink.mockResolvedValue('/repo/report.md');
    expect(await getOpenedFilePath(42)).toBe('/repo/report.md');
    expect(mocks.readlink).toHaveBeenCalledWith('/proc/self/fd/42');
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('uses Darwin F_GETPATH with the existing descriptor and a PATH_MAX buffer', async () => {
    platform('darwin');
    const expected = '/private/tmp/中文 # report.md';
    mocks.fcntl.mockImplementation((fd, cmd, type, buffer: Buffer) => {
      expect([fd, cmd, type, buffer.length]).toEqual([42, 50, 'void *', 1024]);
      buffer.write(expected);
      return 0;
    });
    expect(await getOpenedFilePath(42)).toBe(expected);
    expect(mocks.load).toHaveBeenCalledWith('/usr/lib/libSystem.B.dylib');
    expect(mocks.func).toHaveBeenCalledWith('int fcntl(int fd, int cmd, ...)');
    expect(mocks.readlink).not.toHaveBeenCalled();
  });

  it('propagates native errors without falling back to procfs or a pathname', async () => {
    platform('darwin');
    mocks.fcntl.mockReturnValue(-1);
    await expect(getOpenedFilePath(42)).rejects.toThrow('F_GETPATH failed (errno 9)');
    expect(mocks.readlink).not.toHaveBeenCalled();
  });

  it('fails if the native library is unavailable', async () => {
    platform('darwin');
    mocks.load.mockImplementation(() => { throw new Error('Native library unavailable'); });
    await expect(getOpenedFilePath(42)).rejects.toThrow('Native library unavailable');
    expect(mocks.readlink).not.toHaveBeenCalled();
  });

  it.each(['empty', 'unterminated', 'invalid-utf8'])('rejects malformed native output: %s', async (output) => {
    platform('darwin');
    mocks.fcntl.mockImplementation((_fd, _cmd, _type, buffer: Buffer) => {
      if (output === 'unterminated') buffer.fill(65);
      if (output === 'invalid-utf8') buffer[0] = 0xff;
      return 0;
    });
    await expect(getOpenedFilePath(42)).rejects.toThrow();
  });

  it('rejects unsupported platforms', async () => {
    platform('win32');
    await expect(getOpenedFilePath(42)).rejects.toThrow('unsupported');
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.readlink).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, NaN, 0x80000000])('rejects an invalid descriptor: %s', async (fd) => {
    platform('darwin');
    await expect(getOpenedFilePath(fd)).rejects.toThrow('Invalid file descriptor');
    expect(mocks.load).not.toHaveBeenCalled();
  });
});
