import 'next/dist/server/node-environment';
import { describe, expect, it } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { config, proxy } from '@/proxy';

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

describe('upload route authentication coverage', () => {
  it('does not cache unauthenticated file responses', async () => {
    const response = await proxy(new NextRequest('http://localhost/api/session-files/tmp/report.png'));
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
  it.each(['html', 'png', 'svg', 'jpg', 'woff2'])(
    'protects generated %s files even with public asset suffixes', (extension) => {
      expect(matches(`/api/session-files/tmp/report.${extension}`)).toBe(true);
    },
  );

  it.each(['png', 'jpg', 'jpeg', 'webp', 'gif'])(
    'runs the authentication proxy for uploaded %s images', (extension) => {
      expect(matches(`/api/uploads/ws-one/tab-one/private.${extension}`)).toBe(true);
    },
  );

  it.each(['/favicon.ico', '/icon.png', '/fonts/example.woff2', '/_next/static/example.js', '/login'])(
    'preserves public access to %s', (url) => {
      expect(matches(url)).toBe(false);
    },
  );
});
