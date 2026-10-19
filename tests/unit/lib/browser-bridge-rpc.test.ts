import { fork, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import type { NextApiRequest, NextApiResponse } from 'next';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ socketPath: '', authorized: true, panelType: 'web-browser' }));
vi.mock('@/lib/cli-token', () => ({ verifyCliToken: () => mocks.authorized }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaceById: async () => ({ id: 'workspace' }) }));
vi.mock('@/lib/layout-store', () => ({ getLayout: async () => ({ root: { type: 'pane', tabs: [{ id: 'browser', panelType: mocks.panelType }] } }) }));
vi.mock('@/lib/browser-bridge-rpc', async (original) => ({
  ...await original<typeof import('@/lib/browser-bridge-rpc')>(),
  getBrowserBridgeSocketPath: () => mocks.socketPath,
}));

import { BrowserBridgeUnavailableError, createRemoteBrowserBridge, startBrowserBridgeRpc } from '@/lib/browser-bridge-rpc';
import { getBrowserBridge } from '@/lib/browser-bridge-client';
import urlHandler from '@/pages/api/cli/tabs/[tabId]/browser/url';
import screenshotHandler from '@/pages/api/cli/tabs/[tabId]/browser/screenshot';
import evalHandler from '@/pages/api/cli/tabs/[tabId]/browser/eval';
import consoleHandler from '@/pages/api/cli/tabs/[tabId]/browser/console';
import networkHandler from '@/pages/api/cli/tabs/[tabId]/browser/network';

let directory: string;
let child: ChildProcess;
let childPid: number;
const launch = async () => {
  child = fork(path.resolve('tests/fixtures/browser-bridge-process.ts'), [mocks.socketPath], { execArgv: ['--import', 'tsx'], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
  let errorOutput = '';
  child.stderr?.on('data', (chunk) => { errorOutput += chunk; });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`Bridge fixture startup timed out: ${errorOutput}`)); }, 10_000);
    child.once('message', (message) => { childPid = (message as { pid: number }).pid; clearTimeout(timer); resolve(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('exit', (code) => { clearTimeout(timer); if (code !== 0) reject(new Error(errorOutput)); });
  });
};
const stop = async () => {
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
};

beforeAll(async () => {
  directory = mkdtempSync(path.join(os.tmpdir(), 'pmux-bridge-'));
  mocks.socketPath = path.join(directory, 'private/control.sock');
  await launch();
});
beforeEach(() => { mocks.authorized = true; mocks.panelType = 'web-browser'; });
afterAll(async () => {
  if (child?.exitCode === null && child.signalCode === null) await stop();
  rmSync(directory, { recursive: true, force: true });
});

const invoke = async (handler: typeof urlHandler, query = {}, method = 'GET', body = {}) => {
  const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn(), end: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ method, query: { tabId: 'browser', workspaceId: 'workspace', ...query }, body } as unknown as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};

it('serves URL and title through an independent process with no shared global', async () => {
  expect((globalThis as { __ptBrowserBridge?: unknown }).__ptBrowserBridge).toBeUndefined();
  expect(childPid).not.toBe(process.pid);
  const res = await invoke(urlHandler);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith({ tabId: 'browser', url: 'https://example.test/page', title: 'Example page' });
});

it('transfers binary/base64 screenshots and evaluation results/errors', async () => {
  const png = await invoke(screenshotHandler);
  expect(png.end).toHaveBeenCalledWith(Buffer.from('png'));
  const full = await invoke(screenshotHandler, { full: '1', format: 'base64' });
  expect(full.json).toHaveBeenCalledWith({ tabId: 'browser', format: 'png', base64: Buffer.from('full png').toString('base64') });
  const evaluated = await invoke(evalHandler, {}, 'POST', { expression: 'document.title' });
  expect(evaluated.json).toHaveBeenCalledWith({ tabId: 'browser', value: { expression: 'document.title', pid: childPid } });
  const failed = await invoke(evalHandler, {}, 'POST', { expression: 'fail' });
  expect(failed.status).toHaveBeenCalledWith(409);
});

it('preserves console/network filters and response body retrieval', async () => {
  const logs = await invoke(consoleHandler, { since: '20', level: 'error' });
  expect(logs.json).toHaveBeenCalledWith({ tabId: 'browser', entries: [{ level: 'error', text: 'fixture log', ts: 100 }] });
  const network = await invoke(networkHandler, { method: 'POST' });
  expect(network.json).toHaveBeenCalledWith({ tabId: 'browser', entries: [] });
  const body = await invoke(networkHandler, { requestId: 'request-1' });
  expect(body.json).toHaveBeenCalledWith({ tabId: 'browser', requestId: 'request-1', body: 'response body' });
  const missing = await invoke(networkHandler, { requestId: 'missing' });
  expect(missing.status).toHaveBeenCalledWith(404);
});

it('keeps CLI authorization and tab validation ahead of bridge access', async () => {
  mocks.authorized = false;
  expect((await invoke(urlHandler)).status).toHaveBeenCalledWith(403);
  mocks.authorized = true;
  mocks.panelType = 'terminal';
  expect((await invoke(urlHandler)).status).toHaveBeenCalledWith(400);
  expect((await invoke(urlHandler, { workspaceId: undefined })).status).toHaveBeenCalledWith(400);
  expect((await invoke(urlHandler, { tabId: 'missing' })).status).toHaveBeenCalledWith(404);
});

it('restricts socket permissions and refuses to replace a live bridge or regular file', async () => {
  expect(statSync(mocks.socketPath).mode & 0o777).toBe(0o600);
  expect(statSync(path.dirname(mocks.socketPath)).mode & 0o777).toBe(0o700);
  const bridge = createRemoteBrowserBridge(mocks.socketPath);
  await expect(startBrowserBridgeRpc(bridge, mocks.socketPath)).rejects.toThrow('already running');
  const file = path.join(directory, 'private/file');
  writeFileSync(file, 'do not replace');
  await expect(startBrowserBridgeRpc(bridge, file)).rejects.toThrow('not a socket');
});

it('rejects methods outside the browser operation allowlist', async () => {
  const status = await new Promise((resolve, reject) => {
    const req = request({ socketPath: mocks.socketPath, path: '/', method: 'POST' }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject);
    req.end(JSON.stringify({ method: 'constructor', args: [] }));
  });
  expect(status).toBe(400);
});

it('times out pending work and keeps the existing same-process bridge preferred', async () => {
  const bridge = createRemoteBrowserBridge(mocks.socketPath, 30);
  await expect(bridge.evaluate('browser', 'hang')).rejects.toBeInstanceOf(BrowserBridgeUnavailableError);
  const g = globalThis as { __ptBrowserBridge?: typeof bridge };
  g.__ptBrowserBridge = bridge;
  try { expect(getBrowserBridge()).toBe(bridge); } finally { delete g.__ptBrowserBridge; }
});

it('reports desktop disconnect as 503 and reconnects after restart', async () => {
  const pending = once(child, 'message');
  const response = invoke(evalHandler, {}, 'POST', { expression: 'hang' });
  await pending;
  await stop();
  expect((await response).status).toHaveBeenCalledWith(503);
  expect((await invoke(urlHandler)).status).toHaveBeenCalledWith(503);
  await launch();
  expect((await invoke(urlHandler)).status).toHaveBeenCalledWith(200);
});

it('recovers a stale socket after the desktop process crashes', async () => {
  const exited = once(child, 'exit');
  child.kill('SIGKILL');
  await exited;
  expect(statSync(mocks.socketPath).isSocket()).toBe(true);
  expect((await invoke(urlHandler)).status).toHaveBeenCalledWith(503);
  await launch();
  expect((await invoke(urlHandler)).status).toHaveBeenCalledWith(200);
});
