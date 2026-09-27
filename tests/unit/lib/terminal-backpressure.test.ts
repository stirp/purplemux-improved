import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { WebSocket } from 'ws';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(), pause: vi.fn(), resume: vi.fn(),
  onData: undefined as ((data: string) => void) | undefined,
  onExit: undefined as ((event: { exitCode: number; signal: number }) => void) | undefined,
}));
vi.mock('node-pty', () => ({ spawn: mocks.spawn }));
vi.mock('@/lib/tmux', () => ({ hasSession: async () => true }));
vi.mock('@/lib/shell-env', () => ({ buildShellEnv: () => ({}) }));
vi.mock('@/lib/pristine-env', () => ({ PRISTINE_ENV: {} }));
vi.mock('@/lib/layout-store', () => ({ reconcileTabCwd: vi.fn() }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));
import { handleConnection } from '@/lib/terminal-server';
import { encodeStdoutAck, encodeResize, MSG_STDOUT_ACK } from '@/lib/terminal-protocol';
import { TerminalWriteQueue } from '@/lib/terminal-write-queue';
import { Terminal } from '@xterm/xterm';

const createSocket = () => Object.assign(new EventEmitter(), {
  readyState: WebSocket.OPEN as number,
  bufferedAmount: 0,
  close: vi.fn(),
  send: vi.fn((_data: Uint8Array, _callback?: (error?: Error) => void) => {}),
});
let ws: ReturnType<typeof createSocket>;
let callbacks: ((error?: Error) => void)[];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  callbacks = [];
  ws = createSocket();
  ws.send.mockImplementation((_data, callback) => { if (callback) callbacks.push(callback); });
  mocks.spawn.mockReturnValue({
    pid: 123, write: vi.fn(), resize: vi.fn(), kill: vi.fn(), pause: mocks.pause, resume: mocks.resume,
    onData: (callback: (data: string) => void) => { mocks.onData = callback; return { dispose: vi.fn() }; },
    onExit: (callback: typeof mocks.onExit) => { mocks.onExit = callback; return { dispose: vi.fn() }; },
  });
  await handleConnection(ws as unknown as WebSocket, { url: '/api/terminal?session=fixture' } as IncomingMessage, 'fixture');
  vi.advanceTimersByTime(600);
});
afterEach(() => {
  ws.emit('close');
  vi.useRealTimers();
});

describe('terminal output backpressure', () => {
  it('resumes a paused PTY when queued output drains without another terminal data event', () => {
    ws.bufferedAmount = 2 * 1024 * 1024;
    mocks.onData!('output');
    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(callbacks).toHaveLength(1);
    ws.bufferedAmount = 0;
    callbacks[0]();
    expect(mocks.resume).toHaveBeenCalledOnce();
  });

  it('waits until the backlog falls below the low threshold and resumes only once', () => {
    ws.bufferedAmount = 2 * 1024 * 1024;
    mocks.onData!('first');
    mocks.onData!('already buffered');
    mocks.onData!('last');
    expect(mocks.pause).toHaveBeenCalledOnce();
    expect(callbacks).toHaveLength(3);
    ws.bufferedAmount = 512 * 1024;
    callbacks[0]();
    expect(mocks.resume).not.toHaveBeenCalled();
    ws.bufferedAmount = 0;
    callbacks[1]();
    callbacks[2]();
    expect(mocks.resume).toHaveBeenCalledOnce();
  });

  it.each(['close', 'error', 'exit', 'closing', 'send-error'])(
    'does not resume after %s when an outstanding send completes', (event) => {
      ws.bufferedAmount = 2 * 1024 * 1024;
      mocks.onData!('output');
      expect(callbacks).toHaveLength(1);
      if (event === 'exit') mocks.onExit!({ exitCode: 0, signal: 0 });
      else if (event === 'closing') ws.readyState = WebSocket.CLOSING;
      else if (event !== 'send-error') ws.emit(event, new Error('Disconnected'));
      ws.bufferedAmount = 0;
      callbacks[0](event === 'send-error' ? new Error('Send failed') : undefined);
      expect(mocks.resume).not.toHaveBeenCalled();
    },
  );

  it('keeps ordinary output flowing without pausing the PTY', () => {
    mocks.onData!('output');
    expect(ws.send).toHaveBeenCalledOnce();
    expect(callbacks).toHaveLength(1);
    callbacks[0]();
    expect(mocks.pause).not.toHaveBeenCalled();
    expect(mocks.resume).not.toHaveBeenCalled();
  });
});

describe('browser parser acknowledgements', () => {
  beforeEach(async () => {
    ws.emit('close');
    ws.removeAllListeners();
    callbacks = [];
    ws.send.mockClear();
    await handleConnection(ws as unknown as WebSocket, { url: '/api/terminal?session=fixture&flowControl=1' } as IncomingMessage, 'fixture');
    vi.advanceTimersByTime(600);
  });

  it('drains repeated output bursts through the real parser and resumes the producer', () => {
    const terminal = new Terminal({ scrollback: 0 });
    const writer = new TerminalWriteQueue(terminal);
    let paused = false;
    let acknowledged = 0;
    mocks.pause.mockImplementation(() => { paused = true; });
    mocks.resume.mockImplementation(() => { paused = false; });
    ws.send.mockImplementation((frame, sent) => {
      const payload = frame.subarray(1);
      writer.write(payload, (error) => {
        expect(error).toBeUndefined();
        acknowledged += payload.byteLength;
        ws.emit('message', encodeStdoutAck(payload.byteLength));
      });
      sent?.();
    });
    let produced = 0;
    const total = 2 * 1024 * 1024;
    try {
      // A real PTY stops producing when pause() propagates back to it.
      for (let round = 0; round < 32 && acknowledged < total; round++) {
        while (!paused && produced < total) {
          mocks.onData!('\0'.repeat(32 * 1024));
          produced += 32 * 1024;
        }
        expect(produced - acknowledged).toBeLessThanOrEqual(256 * 1024);
        vi.advanceTimersByTime(100);
      }
      expect(produced).toBe(total);
      expect(acknowledged).toBe(total);
      expect(mocks.pause).toHaveBeenCalledTimes(8);
      expect(mocks.resume).toHaveBeenCalledTimes(8);
      expect(paused).toBe(false);
    } finally {
      writer.dispose();
      terminal.dispose();
    }
  });

  it('pauses even on a fast network and resumes only after the browser parses output', () => {
    const output = 'x'.repeat(256 * 1024);
    mocks.onData!(output);
    expect(mocks.pause).toHaveBeenCalledOnce();
    callbacks[0]();
    expect(mocks.resume).not.toHaveBeenCalled();
    ws.emit('message', encodeStdoutAck(192 * 1024));
    expect(mocks.resume).not.toHaveBeenCalled();
    ws.emit('message', encodeStdoutAck(64 * 1024));
    expect(mocks.resume).toHaveBeenCalledOnce();
  });

  it('counts UTF-8 bytes rather than string length and ignores invalid acknowledgements', () => {
    const output = '界'.repeat(90_000);
    mocks.onData!(output);
    expect(mocks.pause).toHaveBeenCalledOnce();
    ws.emit('message', new Uint8Array([MSG_STDOUT_ACK, 1]).buffer);
    ws.emit('message', encodeStdoutAck(0));
    ws.emit('message', encodeStdoutAck(270_001));
    expect(mocks.resume).not.toHaveBeenCalled();
    ws.emit('message', encodeStdoutAck(output.length));
    expect(mocks.resume).not.toHaveBeenCalled();
    ws.emit('message', encodeStdoutAck(180_000));
    expect(mocks.resume).toHaveBeenCalledOnce();
    ws.emit('message', encodeStdoutAck(180_000));
    expect(mocks.resume).toHaveBeenCalledOnce();
  });

  it('requires both the network and parser to drain before resuming', () => {
    ws.bufferedAmount = 2 * 1024 * 1024;
    mocks.onData!('x'.repeat(256 * 1024));
    ws.emit('message', encodeStdoutAck(256 * 1024));
    expect(mocks.resume).not.toHaveBeenCalled();
    ws.bufferedAmount = 0;
    callbacks[0]();
    expect(mocks.resume).toHaveBeenCalledOnce();
  });

  it('does not resume a closed connection when an acknowledgement arrives late', () => {
    mocks.onData!('x'.repeat(256 * 1024));
    ws.emit('close');
    ws.emit('message', encodeStdoutAck(256 * 1024));
    expect(mocks.resume).not.toHaveBeenCalled();
  });

  it('bounds reflow batches and sends buffered output before post-resize output', () => {
    ws.emit('message', encodeResize(100, 30));
    mocks.onData!('x'.repeat(64 * 1024));
    expect(ws.send).toHaveBeenCalledOnce();
    mocks.onData!('older');
    vi.setSystemTime(Date.now() + 501);
    mocks.onData!('newer');
    const frames = ws.send.mock.calls.map(([data]) => new TextDecoder().decode(data.subarray(1)));
    expect(frames).toEqual(['x'.repeat(64 * 1024), 'older', 'newer']);
  });
});
