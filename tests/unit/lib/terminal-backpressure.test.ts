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
