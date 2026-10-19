import { createServer, request, type Server } from 'node:http';
import { connect } from 'node:net';
import { chmod, lstat, mkdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import type { IBrowserBridgeClient } from '@/lib/browser-bridge-client';

const METHODS = ['list', 'getUrl', 'getTitle', 'capture', 'evaluate', 'getConsole', 'getNetwork', 'getResponseBody', 'reload', 'navigate'] as const;
const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;

export const getBrowserBridgeSocketPath = () => path.join(os.homedir(), '.purplemux', 'browser-bridge', 'control.sock');

export class BrowserBridgeUnavailableError extends Error {}

const removeStaleSocket = async (socketPath: string) => {
  try {
    const stat = await lstat(socketPath);
    if (!stat.isSocket()) throw new Error('Browser bridge path is not a socket');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  const stale = await new Promise<boolean>((resolve, reject) => {
    const socket = connect(socketPath);
    socket.setTimeout(1000, () => socket.destroy(new Error('Browser bridge probe timed out')));
    socket.once('connect', () => { socket.destroy(); resolve(false); });
    socket.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') resolve(true);
      else reject(error);
    });
  });
  if (!stale) throw new Error('Browser bridge is already running');
  await unlink(socketPath).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; });
};

export const startBrowserBridgeRpc = async (bridge: IBrowserBridgeClient, socketPath = getBrowserBridgeSocketPath()): Promise<Server> => {
  await mkdir(path.dirname(socketPath), { recursive: true, mode: 0o700 });
  await chmod(path.dirname(socketPath), 0o700);
  await removeStaleSocket(socketPath);
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.headers.origin || req.method !== 'POST' || req.url !== '/') {
      res.writeHead(403).end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_REQUEST_BYTES) {
          res.writeHead(413).end(JSON.stringify({ error: 'Browser request is too large' }));
          return;
        }
        chunks.push(Buffer.from(chunk));
      }
      const { method, args } = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { method: typeof METHODS[number]; args: unknown[] };
      if (!METHODS.includes(method) || !Array.isArray(args) || (method !== 'list' && typeof args[0] !== 'string')) {
        res.writeHead(400).end(JSON.stringify({ error: 'Invalid browser bridge operation' }));
        return;
      }
      const value = await Reflect.apply(bridge[method], bridge, args);
      const body = JSON.stringify({ value });
      if (Buffer.byteLength(body) > MAX_RESPONSE_BYTES) throw new Error('Browser response is too large');
      res.end(body);
    } catch (error) {
      if (!res.destroyed) res.writeHead(400).end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
  });
  server.setTimeout(15_000, (socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => { server.removeListener('error', reject); resolve(); });
  });
  try {
    await chmod(socketPath, 0o600);
  } catch (error) {
    server.close();
    throw error;
  }
  return server;
};

export const stopBrowserBridgeRpc = async (server: Server): Promise<void> => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
};

export const createRemoteBrowserBridge = (socketPath = getBrowserBridgeSocketPath(), timeoutMs = 15_000): IBrowserBridgeClient => {
  const call = <T>(method: typeof METHODS[number], args: unknown[]): Promise<T> => new Promise((resolve, reject) => {
    while (args.length && args[args.length - 1] === undefined) args.pop();
    const body = JSON.stringify({ method, args });
    const req = request({ socketPath, path: '/', method: 'POST', agent: false, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } });
    const timer = setTimeout(() => req.destroy(new BrowserBridgeUnavailableError('Browser bridge timed out')), timeoutMs);
    const fail = (error: Error) => { clearTimeout(timer); reject(error); };
    req.on('error', (error) => fail(new BrowserBridgeUnavailableError(error.message)));
    req.on('response', (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) req.destroy(new BrowserBridgeUnavailableError('Browser response is too large'));
        else chunks.push(chunk);
      });
      res.on('error', (error) => fail(new BrowserBridgeUnavailableError(error.message)));
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { value: T; error?: string };
          if (res.statusCode !== 200) reject(new Error(result.error || 'Browser operation failed'));
          else resolve(result.value);
        } catch {
          reject(new BrowserBridgeUnavailableError('Invalid browser bridge response'));
        }
      });
    });
    req.end(body);
  });
  return {
    list: () => call('list', []),
    getUrl: (tabId) => call('getUrl', [tabId]),
    getTitle: (tabId) => call('getTitle', [tabId]),
    capture: (tabId, options) => call('capture', [tabId, options]),
    evaluate: (tabId, expression) => call('evaluate', [tabId, expression]),
    getConsole: (tabId, since) => call('getConsole', [tabId, since]),
    getNetwork: (tabId, since) => call('getNetwork', [tabId, since]),
    getResponseBody: (tabId, requestId) => call('getResponseBody', [tabId, requestId]),
    reload: (tabId) => call('reload', [tabId]),
    navigate: (tabId, url) => call('navigate', [tabId, url]),
  };
};
