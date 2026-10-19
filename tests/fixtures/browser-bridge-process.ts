import { startBrowserBridgeRpc, stopBrowserBridgeRpc } from '../../src/lib/browser-bridge-rpc';
import type { IBrowserBridgeClient } from '../../src/lib/browser-bridge-client';

const bridge: IBrowserBridgeClient = {
  list: () => [{ tabId: 'browser', webContentsId: 42 }],
  getUrl: (tabId) => tabId === 'browser' ? 'https://example.test/page' : null,
  getTitle: () => 'Example page',
  capture: async (_tabId, options = {}) => Buffer.from(options.fullPage ? 'full png' : 'png').toString('base64'),
  evaluate: async (_tabId, expression) => {
    if (expression === 'fail') throw new Error('Page evaluation failed');
    if (expression === 'hang') {
      process.send?.({ event: 'pending' });
      return new Promise(() => {});
    }
    return { expression, pid: process.pid };
  },
  getConsole: (_tabId, since = 0) => [{ level: 'error', text: 'fixture log', ts: 100 }, { level: 'info', text: 'old', ts: 10 }].filter((entry) => entry.ts > since),
  getNetwork: (_tabId, since = 0) => [{ requestId: 'request-1', method: 'GET', url: 'https://example.test/data', status: 200, ts: 100 }].filter((entry) => entry.ts > since),
  getResponseBody: async (_tabId, id) => id === 'request-1' ? 'response body' : null,
  reload: () => {},
  navigate: async () => {},
};

void startBrowserBridgeRpc(bridge, process.argv[2]).then((server) => {
  process.send?.({ event: 'ready', pid: process.pid });
  process.on('SIGTERM', () => { void stopBrowserBridgeRpc(server).then(() => process.exit(0)); });
});
