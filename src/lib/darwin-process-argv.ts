const MAX_ARG_BUFFER_SIZE = 16 * 1024 * 1024;

const parseProcArgs = (buffer: Buffer): string[] => {
  if (buffer.length < 4) return [];
  const argc = buffer.readInt32LE(0);
  if (argc <= 0 || argc > buffer.length - 4) return [];
  // KERN_PROCARGS2: argc, executable path, NUL padding, argc NUL-terminated arguments, environment.
  const executableEnd = buffer.indexOf(0, 4);
  if (executableEnd < 0) return [];
  let offset = executableEnd + 1;
  while (offset < buffer.length && buffer[offset] === 0) offset++;
  const argv: string[] = [];
  for (let i = 0; i < argc; i++) {
    const end = buffer.indexOf(0, offset);
    if (end < 0) return [];
    argv.push(buffer.toString('utf8', offset, end));
    offset = end + 1;
  }
  return argv;
};

export const getDarwinProcessArgv = async (pid: number): Promise<string[]> => {
  const { default: koffi } = await import('koffi');
  const libc = koffi.load('/usr/lib/libSystem.B.dylib');
  const sysctl = libc.func('int sysctl(const int *name, unsigned int namelen, void *oldp, _Inout_ size_t *oldlenp, const void *newp, size_t newlen)');
  // Darwin sys/sysctl.h: CTL_KERN = 1, KERN_ARGMAX = 8, KERN_PROCARGS2 = 49.
  const argmax = Buffer.alloc(4);
  const argmaxLength = [argmax.length];
  if (sysctl([1, 8], 2, argmax, argmaxLength, null, 0) !== 0 || argmaxLength[0] !== 4) return [];
  const size = argmax.readInt32LE(0);
  if (size < 4 || size > MAX_ARG_BUFFER_SIZE) return [];
  const buffer = Buffer.alloc(size);
  const length = [size];
  if (sysctl([1, 49, pid], 3, buffer, length, null, 0) !== 0) return [];
  if (!Number.isInteger(length[0]) || length[0] < 4 || length[0] > size) return [];
  return parseProcArgs(buffer.subarray(0, length[0]));
};
