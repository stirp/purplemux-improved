import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeStdin, encodeResize, decodeMessage, MSG_STDOUT } from '@/lib/terminal-protocol';

type TInstallStatus = 'idle' | 'connected' | 'disconnected';

interface IUseInstallWebSocket {
  status: TInstallStatus;
  connect: (command: string, cols: number, rows: number) => void;
  disconnect: () => void;
  sendStdin: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
}

const useInstallWebSocket = (onData: (data: Uint8Array) => void): IUseInstallWebSocket => {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const [status, setStatus] = useState<TInstallStatus>('idle');
  const onDataRef = useRef(onData);
  useEffect(() => { onDataRef.current = onData; }, [onData]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    wsRef.current = null;
    pendingResizeRef.current = null;
    if (ws) {
      ws.close();
    }
  }, []);

  useEffect(() => disconnect, [disconnect]);

  const connect = useCallback((command: string, cols: number, rows: number) => {
    disconnect();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/install?command=${encodeURIComponent(command)}&cols=${cols}&rows=${rows}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      const resize = pendingResizeRef.current;
      pendingResizeRef.current = null;
      if (resize) ws.send(encodeResize(resize.cols, resize.rows));
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      if (wsRef.current !== ws) return;
      const msg = decodeMessage(event.data as ArrayBuffer);
      if (msg.type === MSG_STDOUT) {
        onDataRef.current(msg.payload);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      pendingResizeRef.current = null;
      setStatus('disconnected');
    };

    ws.onerror = () => {
      if (wsRef.current !== ws) return;
      wsRef.current = null;
      pendingResizeRef.current = null;
      setStatus('disconnected');
    };
  }, [disconnect]);

  const sendStdin = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeStdin(data));
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.CONNECTING) {
      pendingResizeRef.current = { cols, rows };
    } else if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeResize(cols, rows));
    }
  }, []);

  return { status, connect, disconnect, sendStdin, sendResize };
};

export default useInstallWebSocket;
