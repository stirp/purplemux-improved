import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useInstallWebSocket from '@/hooks/use-install-websocket';
import { encodeResize, encodeStdin } from '@/lib/terminal-protocol';

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => [initial, vi.fn()],
}));

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  binaryType = '';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send = vi.fn((_data: ArrayBuffer) => {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
  });

  close() {
    this.readyState = MockWebSocket.CLOSING;
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.stubGlobal('window', { location: { protocol: 'https:', host: 'install.example.test' } });
});

afterEach(() => vi.unstubAllGlobals());

describe('install WebSocket sends', () => {
  it('waits for a slow handshake and then sends only the latest terminal size', () => {
    const connection = useInstallWebSocket(vi.fn());
    connection.connect('claude', 80, 24);
    const ws = MockWebSocket.instances[0];

    expect(() => {
      connection.sendResize(100, 30);
      connection.sendResize(120, 40);
      connection.sendStdin('early input');
    }).not.toThrow();
    expect(ws.send).not.toHaveBeenCalled();

    ws.open();
    expect(ws.send).toHaveBeenCalledExactlyOnceWith(encodeResize(120, 40));
    connection.sendStdin('yes\n');
    expect(ws.send).toHaveBeenLastCalledWith(encodeStdin('yes\n'));
    connection.sendResize(140, 50);
    expect(ws.send).toHaveBeenLastCalledWith(encodeResize(140, 50));
  });

  it.each([MockWebSocket.CLOSING, MockWebSocket.CLOSED])('does not send in socket state %s', (state) => {
    const connection = useInstallWebSocket(vi.fn());
    connection.connect('claude', 80, 24);
    const ws = MockWebSocket.instances[0];
    ws.readyState = state;
    expect(() => {
      connection.sendResize(100, 30);
      connection.sendStdin('input');
    }).not.toThrow();
    expect(ws.send).not.toHaveBeenCalled();
  });

  it('ignores late events and pending sizes from the replaced connection', () => {
    const connection = useInstallWebSocket(vi.fn());
    connection.connect('claude', 80, 24);
    const previous = MockWebSocket.instances[0];
    connection.sendResize(100, 30);
    connection.connect('claude', 90, 25);
    const current = MockWebSocket.instances[1];

    previous.onclose?.();
    previous.onerror?.();
    current.open();
    expect(current.send).not.toHaveBeenCalled();
    connection.sendStdin('input');
    expect(current.send).toHaveBeenCalledExactlyOnceWith(encodeStdin('input'));

    connection.disconnect();
    expect(() => connection.sendResize(120, 40)).not.toThrow();
    expect(current.send).toHaveBeenCalledTimes(1);
  });
});
