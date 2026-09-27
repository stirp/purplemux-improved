import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTerminalWebSocket from '@/hooks/use-terminal-websocket';
import useTerminal from '@/hooks/use-terminal';
import { encodeStdout, encodeStdoutAck } from '@/lib/terminal-protocol';
import { TerminalWriteQueue, type TTerminalWriteCallback } from '@/lib/terminal-write-queue';

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: () => void) => { effect(); },
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: {} }));
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: vi.fn() }));

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static instances: MockWebSocket[] = [];
  readyState = 0;
  onopen?: () => void;
  onclose?: (event: { code: number }) => void;
  onmessage?: (event: { data: ArrayBuffer }) => void;
  send = vi.fn();
  close = vi.fn(() => { this.readyState = 3; });
  constructor(public url: string) { MockWebSocket.instances.push(this); }
  open() { this.readyState = 1; this.onopen?.(); }
  output(text: string) { this.onmessage?.({ data: encodeStdout(text).buffer as ArrayBuffer }); }
}

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('location', { protocol: 'https:', host: 'terminal.test' });
  vi.stubGlobal('sessionStorage', { getItem: () => 'client', setItem: vi.fn() });
  vi.stubGlobal('document', { addEventListener: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('terminal output ACK lifecycle', () => {
  it('closes outstanding output on writer teardown and stays disconnected until remounted', () => {
    let parsed!: () => void;
    let writer = new TerminalWriteQueue({
      write: (_data, done) => { parsed = done; },
      reset: vi.fn(),
    });
    const connection = useTerminalWebSocket({ onData: (data, done) => writer.write(data, done) });
    connection.connect('session');
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.output('x'.repeat(256 * 1024));
    vi.advanceTimersByTime(1);
    expect(ws.send).not.toHaveBeenCalled();
    writer.dispose();
    expect(ws.close).toHaveBeenCalledWith(4000, 'Terminal output processing failed');
    // The mobile surface disconnects when its terminal is no longer ready.
    connection.disconnect();
    ws.onclose?.({ code: 4000 });
    parsed();
    vi.advanceTimersByTime(60_000);
    expect(ws.send).not.toHaveBeenCalled();
    expect(MockWebSocket.instances).toHaveLength(1);

    writer = new TerminalWriteQueue({ write: (_data, done) => done(), reset: vi.fn() });
    connection.connect('session');
    const restored = MockWebSocket.instances[1];
    restored.open();
    restored.output('new');
    vi.advanceTimersByTime(1);
    expect(restored.send).toHaveBeenCalledExactlyOnceWith(encodeStdoutAck(3));
    expect(restored.close).not.toHaveBeenCalled();
    writer.dispose();
    connection.disconnect();
  });

  it('closes output received while useTerminal has no mounted writer', () => {
    const terminal = useTerminal();
    const connection = useTerminalWebSocket({ onData: terminal.write });
    connection.connect('session');
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.output('background output');
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledWith(4000, 'Terminal output processing failed');
    connection.disconnect();
  });

  it('acknowledges UTF-8 bytes once, only after xterm has parsed the message', () => {
    let parsed!: TTerminalWriteCallback;
    const connection = useTerminalWebSocket({ onData: (_data, done) => { parsed = done; } });
    connection.connect('session');
    const ws = MockWebSocket.instances[0];
    expect(new URL(ws.url).searchParams.get('flowControl')).toBe('1');
    ws.open();
    ws.output('界');
    expect(ws.send).not.toHaveBeenCalled();
    parsed();
    parsed();
    expect(ws.send).toHaveBeenCalledExactlyOnceWith(encodeStdoutAck(3));
  });

  it('ignores old parser callbacks and socket events after automatic reconnection', () => {
    let parsed!: TTerminalWriteCallback;
    const onConnected = vi.fn();
    const onData = vi.fn((_data: Uint8Array, done: TTerminalWriteCallback) => { parsed = done; });
    const connection = useTerminalWebSocket({ onData, onConnected });
    connection.connect('session');
    const previous = MockWebSocket.instances[0];
    previous.open();
    previous.output('old');
    previous.readyState = 3;
    previous.onclose?.({ code: 1006 });
    vi.advanceTimersByTime(1000);
    const current = MockWebSocket.instances[1];
    current.open();
    parsed();
    previous.output('stale');
    previous.onopen?.();
    previous.onclose?.({ code: 1006 });
    expect(onData).toHaveBeenCalledOnce();
    expect(onConnected).toHaveBeenCalledTimes(2);
    expect(previous.send).not.toHaveBeenCalled();
    expect(current.send).not.toHaveBeenCalled();
    current.output('new');
    parsed();
    expect(current.send).toHaveBeenCalledExactlyOnceWith(encodeStdoutAck(3));
  });

  it('closes a failed parser connection instead of acknowledging lost output', () => {
    let parsed!: TTerminalWriteCallback;
    const connection = useTerminalWebSocket({ onData: (_data, done) => { parsed = done; } });
    connection.connect('session');
    const ws = MockWebSocket.instances[0];
    ws.open();
    ws.output('data');
    parsed(new Error('parser failed'));
    expect(ws.send).not.toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalledWith(4000, 'Terminal output processing failed');
  });
});
