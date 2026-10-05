import { WebSocket } from 'ws';
import { createLogger } from '@/lib/logger';
import type { TPublicConfig } from '@/lib/public-config';

const log = createLogger('sync');

export type TSystemToastVariant = 'info' | 'success' | 'warning' | 'error';

export type TSystemToastAction = {
  kind: 'copy';
  label: string;
  text: string;
  successMessage?: string;
};

export interface ISystemToastEvent {
  type: 'system-toast';
  key: string;
  variant: TSystemToastVariant;
  message: string;
  durationMs?: number;
  action?: TSystemToastAction;
}

type TSyncEvent =
  | { type: 'workspace' }
  | { type: 'layout'; workspaceId: string }
  | { type: 'config'; config: TPublicConfig }
  | ISystemToastEvent;

const g = globalThis as unknown as {
  __ptSyncClients?: Set<WebSocket>;
  __ptPendingToasts?: Map<string, ISystemToastEvent>;
};
if (!g.__ptSyncClients) g.__ptSyncClients = new Set();
if (!g.__ptPendingToasts) g.__ptPendingToasts = new Map();

const clients = g.__ptSyncClients;
const pendingToasts = g.__ptPendingToasts;

const sendToOne = (ws: WebSocket, payload: string) => {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < BACKPRESSURE_LIMIT) {
    ws.send(payload);
  }
};

export const handleSyncConnection = (ws: WebSocket) => {
  clients.add(ws);
  for (const toast of pendingToasts.values()) {
    sendToOne(ws, JSON.stringify(toast));
  }
  ws.on('close', () => clients.delete(ws));
  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    clients.delete(ws);
  });
};

const BACKPRESSURE_LIMIT = 1024 * 1024;

export const broadcastSync = (event: TSyncEvent) => {
  const msg = JSON.stringify(event);
  for (const ws of clients) sendToOne(ws, msg);
};

export const enqueueSystemToast = (toast: ISystemToastEvent): void => {
  pendingToasts.set(toast.key, toast);
  broadcastSync(toast);
};

export const dismissSystemToast = (key: string): void => {
  pendingToasts.delete(key);
};

export const gracefulSyncShutdown = () => {
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1001, 'Server shutting down');
    }
  }
  clients.clear();
};
