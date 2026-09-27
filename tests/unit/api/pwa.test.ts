import { describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest } from 'next/server';
import handler from '@/pages/api/manifest';
import { proxy } from '@/proxy';

describe('PWA installation', () => {
  it.each([
    {},
    { host: 'localhost:8022' },
    { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'app.example.test' },
  ])('keeps the launch URL and scope on the browser origin with headers %j', (headers) => {
    const res = { setHeader: vi.fn(), send: vi.fn() };
    handler({ headers } as NextApiRequest, res as unknown as NextApiResponse);
    const manifest = JSON.parse(res.send.mock.calls[0][0]);
    const manifestUrl = 'https://app.example.test:4443/api/manifest';
    for (const field of ['id', 'start_url', 'scope']) {
      expect(new URL(manifest[field], manifestUrl).href).toBe('https://app.example.test:4443/');
    }
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/manifest+json');
  });

  it('serves the service worker before login', async () => {
    const response = await proxy(new NextRequest('https://app.example.test:4443/sw.js'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('location')).toBeNull();
  });

  it.each(['/sw.js/private', '/private.js', '/api/workspaces', '/'])(
    'keeps authentication for %s', async (pathname) => {
      const response = await proxy(new NextRequest(`https://app.example.test:4443${pathname}`));
      if (pathname.startsWith('/api/')) {
        expect(response.status).toBe(401);
      } else {
        expect(response.status).toBe(307);
        expect(response.headers.get('location')).toBe('https://app.example.test:4443/login');
      }
    },
  );
});
