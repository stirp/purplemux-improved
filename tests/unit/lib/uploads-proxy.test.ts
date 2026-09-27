import 'next/dist/server/node-environment';
import { describe, expect, it } from 'vitest';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { config } from '@/proxy';

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });

describe('upload route authentication coverage', () => {
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
