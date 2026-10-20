import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getProcessArgv } from '@/lib/process-utils';
import { matchesAgentProcess } from '@/lib/agent-process-identity';
import { detectActiveSession } from '@/lib/providers/claude/session-detection';

const mocks = vi.hoisted(() => ({
  platform: vi.fn(), load: vi.fn(), func: vi.fn(), sysctl: vi.fn(), readFile: vi.fn(),
  readdir: vi.fn(), realpath: vi.fn(), unlink: vi.fn(),
}));
vi.mock('node:process', () => ({ getBuiltinModule: () => ({ platform: mocks.platform }) }));
vi.mock('@/lib/platform', () => ({ isLinux: false }));
vi.mock('koffi', () => ({ default: { load: mocks.load } }));
vi.mock('fs/promises', () => ({ default: {
  readFile: mocks.readFile, readdir: mocks.readdir, realpath: mocks.realpath,
  unlink: mocks.unlink, access: async () => undefined,
} }));
vi.mock('child_process', () => ({ execFile: Object.assign(vi.fn(), {
  [Symbol.for('nodejs.util.promisify.custom')]: async (_cmd: string, args: string[]) => ({
    stdout: args[0] === '-P' ? '' : 'node /Volumes/Development Tools/claude',
  }),
}) }));

const nativeData = (argv: string[]) => {
  const count = Buffer.alloc(4);
  count.writeInt32LE(argv.length);
  return Buffer.concat([count, Buffer.from('/real executable\0\0\0'), Buffer.from(argv.join('\0') + '\0'), Buffer.from('SECRET=claude codex\0\0')]);
};
const setNativeData = (data: Buffer) => {
  mocks.sysctl.mockImplementation((mib: number[], count: number, output: Buffer, length: number[], input: null, inputLength: number) => {
    expect(count).toBe(mib.length);
    expect([input, inputLength]).toEqual([null, 0]);
    if (mib[1] === 8) {
      expect(mib).toEqual([1, 8]);
      output.writeInt32LE(4096);
      length[0] = 4;
    } else {
      expect(mib).toEqual([1, 49, 42]);
      expect(length[0]).toBe(4096);
      data.copy(output);
      length[0] = data.length;
    }
    return 0;
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform.mockReturnValue('darwin');
  mocks.load.mockReturnValue({ func: mocks.func });
  mocks.func.mockReturnValue(mocks.sysctl);
  mocks.realpath.mockImplementation(async (file: string) => file);
  mocks.readdir.mockResolvedValue([]);
});

describe('process argv boundaries', () => {
  it.each([
    ['codex', ['/Volumes/Development Tools/codex', 'ask claude']],
    ['claude', ['/Volumes/Development Tools/claude', 'ask codex']],
    ['codex', ['node', '/Volumes/Development Tools/lib/node_modules/@openai/codex/bin/codex.js', 'claude']],
    ['claude', ['/Volumes/Node Tools/node', '/Volumes/开发 "Tools"/lib/node_modules/@anthropic-ai/claude-code/cli.js', 'codex']],
    ['claude', ['bun', '/Volumes/Development Tools/lib/node_modules/@anthropic-ai/claude-code/cli.js']],
  ] as const)('reads macOS argv intact and identifies %s: %j', async (provider, input) => {
    const argv = [...input];
    setNativeData(nativeData(argv));
    expect(await getProcessArgv({ pid: 42, args: argv.join(' ') })).toEqual(argv);
    expect(await matchesAgentProcess(42, argv.join(' '), provider)).toBe(true);
    expect(await matchesAgentProcess(42, argv.join(' '), provider === 'codex' ? 'claude' : 'codex')).toBe(false);
    expect(mocks.load).toHaveBeenCalledWith('/usr/lib/libSystem.B.dylib');
  });

  it('resolves npm symlinks with spaces only after preserving their argument boundary', async () => {
    setNativeData(nativeData(['node', '/Volumes/Dev Tools/bin/codex']));
    mocks.realpath.mockResolvedValue('/Volumes/Dev Tools/lib/node_modules/@openai/codex/bin/codex.js');
    expect(await matchesAgentProcess(42, 'node /Volumes/Dev Tools/bin/codex', 'codex')).toBe(true);
    expect(mocks.realpath).toHaveBeenCalledWith('/Volumes/Dev Tools/bin/codex');
  });

  it('preserves empty arguments and excludes the environment', async () => {
    const argv = ['node', '', '/pkg/@openai/codex/bin/codex.js', ''];
    setNativeData(nativeData(argv));
    expect(await getProcessArgv({ pid: 42, args: argv.join(' ') })).toEqual(argv);
    expect(await matchesAgentProcess(42, argv.join(' '), 'codex')).toBe(false);
  });

  it('keeps Linux NUL boundaries including empty arguments without loading Koffi', async () => {
    mocks.platform.mockReturnValue('linux');
    mocks.readFile.mockResolvedValue('node\0\0/path with spaces\0\0');
    expect(await getProcessArgv({ pid: 42, args: 'ignored' })).toEqual(['node', '', '/path with spaces', '']);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it.each(['denied', 'missing-library', 'truncated', 'bad-count', 'bad-size', 'unterminated-argument'])('returns no guessed identity on %s', async (failure) => {
    const data = nativeData(['codex']);
    if (failure === 'bad-count') data.writeInt32LE(0x7fffffff);
    setNativeData(failure === 'truncated' ? data.subarray(0, 6) : data);
    if (failure === 'unterminated-argument') setNativeData(data.subarray(0, data.indexOf(Buffer.from('codex')) + 5));
    if (failure === 'denied') mocks.sysctl.mockReturnValue(-1);
    if (failure === 'missing-library') mocks.load.mockImplementation(() => { throw new Error('missing'); });
    if (failure === 'bad-size') mocks.sysctl.mockImplementation((_mib, _count, output: Buffer) => { output.writeInt32LE(0x7fffffff); return 0; });
    expect(await getProcessArgv({ pid: 42, args: 'codex' })).toEqual([]);
  });

  it.each(['query-failed', 'length-overflow', 'length-short'])('rejects incomplete process data after a successful size query: %s', async (failure) => {
    setNativeData(nativeData(['codex']));
    const read = mocks.sysctl.getMockImplementation()!;
    mocks.sysctl.mockImplementation((...args) => {
      const result = read(...args);
      if (args[0][1] !== 49) return result;
      if (failure === 'query-failed') return -1;
      args[3][0] = failure === 'length-overflow' ? 4097 : 3;
      return 0;
    });
    expect(await getProcessArgv({ pid: 42, args: 'codex' })).toEqual([]);
  });

  it.each([0, -1, 1.5, NaN, 0x80000000])('rejects invalid PID %s before native calls', async (pid) => {
    expect(await getProcessArgv({ pid, args: 'codex' })).toEqual([]);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it('does not split display text on unsupported platforms', async () => {
    mocks.platform.mockReturnValue('win32');
    expect(await getProcessArgv({ pid: 42, args: 'codex' })).toEqual([]);
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it.each([true, false])('preserves a Claude PID registration when argv is readable: %s', async (readable) => {
    setNativeData(nativeData(['/Volumes/Dev Tools/claude']));
    if (!readable) mocks.sysctl.mockReturnValue(-1);
    mocks.readdir.mockResolvedValue(['active.json']);
    mocks.readFile.mockResolvedValue(JSON.stringify({ pid: 42, sessionId: 'registered-session', cwd: '/repo', startedAt: 100 }));
    const info = await detectActiveSession(10, [42]);
    expect(info.status).toBe(readable ? 'running' : 'not-running');
    if (readable) expect(info.sessionId).toBe('registered-session');
    expect(mocks.unlink).not.toHaveBeenCalled();
  });
});
