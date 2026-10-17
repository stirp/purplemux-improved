import { readlink } from 'node:fs/promises';
import { getBuiltinModule } from 'node:process';

const getDarwinFilePath = async (fd: number): Promise<string> => {
  const { default: koffi } = await import('koffi');
  const libc = koffi.load('/usr/lib/libSystem.B.dylib');
  const fcntl = libc.func('int fcntl(int fd, int cmd, ...)');
  // Darwin's fcntl.h defines F_GETPATH = 50; syslimits.h requires a PATH_MAX (1024-byte) buffer.
  const buffer = Buffer.alloc(1024);
  if (fcntl(fd, 50, 'void *', buffer) !== 0) {
    throw new Error(`F_GETPATH failed (errno ${koffi.errno()})`);
  }
  const end = buffer.indexOf(0);
  if (end <= 0) throw new Error('F_GETPATH returned an invalid path');
  return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, end));
};

export const getOpenedFilePath = async (fd: number): Promise<string> => {
  if (!Number.isInteger(fd) || fd < 0 || fd > 0x7fffffff) throw new Error('Invalid file descriptor');
  // Next.js folds process.platform and static os.platform imports; resolve the builtin at runtime.
  const runtimePlatform = getBuiltinModule('node:os').platform();
  if (runtimePlatform === 'linux') return readlink(`/proc/self/fd/${fd}`);
  if (runtimePlatform === 'darwin') return getDarwinFilePath(fd);
  throw new Error('Secure file access is unsupported on this platform');
};
