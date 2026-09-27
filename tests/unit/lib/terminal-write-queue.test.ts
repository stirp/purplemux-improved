import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalWriteQueue, TERMINAL_WRITE_CHUNK_BYTES } from '@/lib/terminal-write-queue';
import { Terminal } from '@xterm/xterm';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const createWriter = () => {
  const writes: { data: Uint8Array; parsed: () => void }[] = [];
  const terminal = {
    write: vi.fn((data: Uint8Array, parsed: () => void) => { writes.push({ data, parsed }); }),
    reset: vi.fn(),
  };
  return { terminal, writes, writer: new TerminalWriteQueue(terminal) };
};

describe('terminal parser flow control', () => {
  it('parses a 64 MiB burst with the real xterm parser without hitting its discard watermark', () => {
    const terminal = new Terminal({ scrollback: 0 });
    const writer = new TerminalWriteQueue(terminal);
    const parsed = vi.fn();
    const megabyte = new Uint8Array(1024 * 1024);
    try {
      for (let i = 0; i < 64; i++) writer.write(megabyte, parsed);
      vi.runAllTimers();
      expect(parsed).toHaveBeenCalledTimes(64);
      expect(parsed.mock.calls.every((args) => args.length === 0)).toBe(true);
    } finally {
      writer.dispose();
      terminal.dispose();
    }
  });

  it.each([
    ['UTF-8', '界\x1b]0;parsed title\x07done'],
    ['escape sequence', '\x1b]0;parsed title\x07界done'],
  ])('preserves %s split across real parser writes', (_name, value) => {
    const terminal = new Terminal({ scrollback: 0 });
    const writer = new TerminalWriteQueue(terminal);
    const title = vi.fn();
    terminal.onTitleChange(title);
    const prefix = new Uint8Array(TERMINAL_WRITE_CHUNK_BYTES - 1);
    const text = new TextEncoder().encode(value);
    const output = new Uint8Array(prefix.length + text.length);
    output.set(text, prefix.length);
    try {
      writer.write(output);
      vi.runAllTimers();
      expect(terminal.buffer.active.getLine(0)?.translateToString(true)).toBe('界done');
      expect(title).toHaveBeenCalledWith('parsed title');
    } finally {
      writer.dispose();
      terminal.dispose();
    }
  });

  it('waits for parsing and preserves byte order across chunk and message boundaries', () => {
    const { writer, writes } = createWriter();
    const first = new Uint8Array(TERMINAL_WRITE_CHUNK_BYTES + 3).fill(42);
    const next = new Uint8Array([0xe7, 0x95, 0x8c]);
    const done = vi.fn();
    writer.write(first, done);
    writer.write(next);
    vi.runAllTimers();
    expect(writes).toHaveLength(1);
    expect(writes[0].data.length).toBe(TERMINAL_WRITE_CHUNK_BYTES);
    expect(done).not.toHaveBeenCalled();
    writes[0].parsed();
    vi.runAllTimers();
    expect(writes).toHaveLength(2);
    expect(done).not.toHaveBeenCalled();
    writes[1].parsed();
    vi.runAllTimers();
    expect(done).toHaveBeenCalledOnce();
    expect(writes[2].data).toEqual(next);
    expect(Buffer.concat(writes.map(({ data }) => data))).toEqual(Buffer.concat([first, next]));
  });

  it('handles more than the xterm discard limit without exceeding one in-flight chunk', () => {
    const { writer, writes } = createWriter();
    const megabyte = new Uint8Array(1024 * 1024);
    const done = vi.fn();
    for (let i = 0; i < 64; i++) writer.write(megabyte, done);
    vi.runAllTimers();
    expect(writes).toHaveLength(1);
    let bytes = 0;
    for (let i = 0; i < 1024; i++) {
      expect(writes).toHaveLength(i + 1);
      expect(writes[i].data.length).toBeLessThanOrEqual(TERMINAL_WRITE_CHUNK_BYTES);
      bytes += writes[i].data.length;
      writes[i].parsed();
      vi.runAllTimers();
    }
    expect(bytes).toBe(64 * 1024 * 1024);
    expect(done).toHaveBeenCalledTimes(64);
  });

  it('waits for old parsing to finish before resetting and starting a new session', () => {
    const { writer, writes, terminal } = createWriter();
    const staleAck = vi.fn();
    writer.write(new Uint8Array(TERMINAL_WRITE_CHUNK_BYTES + 1), staleAck);
    vi.runAllTimers();
    writer.reset();
    writer.write(new Uint8Array([9]));
    vi.runAllTimers();
    expect(terminal.reset).not.toHaveBeenCalled();
    expect(writes).toHaveLength(1);
    writes[0].parsed();
    vi.runAllTimers();
    expect(terminal.reset).toHaveBeenCalledOnce();
    expect(staleAck).not.toHaveBeenCalled();
    expect(writes).toHaveLength(2);
    expect(writes[1].data).toEqual(new Uint8Array([9]));
  });

  it('cancels scheduled writes and ignores late callbacks on disposal', () => {
    const { writer, writes } = createWriter();
    const done = vi.fn();
    writer.write(new Uint8Array([1]), done);
    vi.runAllTimers();
    writer.write(new Uint8Array([2]));
    writer.dispose();
    writer.dispose();
    writes[0].parsed();
    const unavailable = vi.fn();
    writer.write(new Uint8Array([3]), unavailable);
    vi.runAllTimers();
    expect(writes).toHaveLength(1);
    expect(done).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    expect(unavailable).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
    const another = createWriter();
    const scheduled = vi.fn();
    another.writer.write(new Uint8Array([1]), scheduled);
    another.writer.dispose();
    vi.runAllTimers();
    expect(another.writes).toHaveLength(0);
    expect(scheduled).toHaveBeenCalledExactlyOnceWith(expect.any(Error));
  });

  it('reports a write failure without acknowledging data or leaving the writer stuck', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { writer, writes, terminal } = createWriter();
    const error = new Error('write failed');
    terminal.write.mockImplementationOnce(() => { throw error; });
    const done = vi.fn();
    writer.write(new Uint8Array([1]), done);
    writer.write(new Uint8Array([2]), done);
    vi.runAllTimers();
    expect(done.mock.calls).toEqual([[error], [error]]);
    writer.reset();
    writer.write(new Uint8Array([3]));
    vi.runAllTimers();
    expect(writes).toHaveLength(1);
    expect(writes[0].data).toEqual(new Uint8Array([3]));
  });
});
