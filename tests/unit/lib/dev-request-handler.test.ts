import { createServer, request, type Server } from 'http';
import { once } from 'events';
import { getCloneableBody } from 'next/dist/server/body-streams';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevRequestHandler } from '@/lib/dev-request-handler';

const servers: Server[] = [];
const listen = async (handler: Parameters<typeof createDevRequestHandler>[0], report = vi.fn()) => {
  const server = createServer(createDevRequestHandler(handler, report));
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  return { port: address.port, url: `http://127.0.0.1:${address.port}`, report };
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  })));
});

describe('development HTTP request handling', () => {
  it.each([false, true])('survives client disconnect (Next.js body restored: %s)', async (cloneBody) => {
    let ready!: () => void;
    const prepared = new Promise<void>((resolve) => { ready = resolve; });
    let closed!: () => void;
    const completed = new Promise<void>((resolve) => { closed = resolve; });
    const { port, url, report } = await listen(async (req, res) => {
      if (req.url === '/health') { res.end('ready'); return; }
      if (cloneBody) {
        const body = getCloneableBody(req);
        body.cloneBodyStream().resume();
        await body.finalize();
      }
      res.once('close', () => setImmediate(closed));
      ready();
    });
    const client = request({ hostname: '127.0.0.1', port, path: '/', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': cloneBody ? 2 : 100 } });
    client.on('error', () => {});
    if (cloneBody) client.end('{}');
    else client.write('{');
    try {
      await prepared;
      client.destroy();
      await completed;
      const response = await fetch(`${url}/health`);
      expect(await response.text()).toBe('ready');
      expect(report).not.toHaveBeenCalled();
    } finally {
      client.destroy();
    }
  });

  it.each(['sync', 'async', 'upstream-reset', 'request-stream', 'response-stream'])(
    'reports %s errors and returns 500 without exposing details', async (kind) => {
      const error = Object.assign(new Error('private failure details'), {
        code: kind === 'upstream-reset' ? 'ECONNRESET' : 'EIO',
      });
      const { url, report } = await listen((req, res) => {
        if (kind === 'async') return Promise.reject(error);
        if (kind === 'request-stream') { req.emit('error', error); return; }
        if (kind === 'response-stream') { res.emit('error', error); return; }
        throw error;
      });
      const response = await fetch(url);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe('Internal Server Error');
      expect(report).toHaveBeenCalledExactlyOnceWith(error);
    },
  );

  it('closes a partial response on failure instead of writing a second header', async () => {
    const error = new Error('stream failed');
    const { port, report } = await listen(async (_req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.write('partial');
      await new Promise((resolve) => setTimeout(resolve, 20));
      throw error;
    });
    await new Promise<void>((resolve, reject) => {
      const client = request({ hostname: '127.0.0.1', port }, (res) => {
        res.resume();
        res.on('error', () => {});
        res.on('close', () => {
          try { expect(res.complete).toBe(false); resolve(); } catch (err) { reject(err); }
        });
      });
      client.on('error', reject);
      client.end();
    });
    expect(report).toHaveBeenCalledExactlyOnceWith(error);
  });
});
