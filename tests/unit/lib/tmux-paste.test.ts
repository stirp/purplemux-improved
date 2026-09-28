import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ exec: vi.fn(), end: vi.fn(), on: vi.fn() }));
vi.mock('child_process', () => ({ execFile: mocks.exec }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), debug: vi.fn() }) }));

import { pasteText } from '@/lib/tmux';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.exec.mockImplementation((_file, _args, _options, callback) => {
    queueMicrotask(() => callback(null, '', ''));
    return { stdin: { on: mocks.on, end: mocks.end } };
  });
});

describe('tmux text paste', () => {
  it('streams long Unicode text and preserves newlines with bracketed paste enabled', async () => {
    const text = '中文🙂\n'.repeat(20_000);
    await pasteText('session', text);
    expect(mocks.end).toHaveBeenCalledExactlyOnceWith(text);
    const args = mocks.exec.mock.calls.map((call) => call[1] as string[]);
    expect(args.flat().every((arg) => Buffer.byteLength(arg) < 1024)).toBe(true);
    const load = args.find((arg) => arg[2] === 'load-buffer')!;
    expect(args).toContainEqual(['-L', 'purple', 'paste-buffer', '-d', '-p', '-r', '-b', load[4], '-t', 'session']);
    expect(args.at(-1)).toEqual(['-L', 'purple', 'delete-buffer', '-b', load[4]]);
  });

  it('cleans up a buffer after loading fails without pasting partial content', async () => {
    mocks.exec.mockImplementation((_file, args, _options, callback) => {
      queueMicrotask(() => callback(args[2] === 'load-buffer' ? new Error('Load failed') : null, '', ''));
      return { stdin: { on: mocks.on, end: mocks.end } };
    });
    await expect(pasteText('session', 'message')).rejects.toThrow('Load failed');
    const commands = mocks.exec.mock.calls.map((call) => call[1][2]);
    expect(commands).not.toContain('paste-buffer');
    expect(commands.at(-1)).toBe('delete-buffer');
  });
});
