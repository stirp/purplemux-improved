import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/auth', () => ({
  verifySessionToken: vi.fn().mockResolvedValue(null), signSessionToken: vi.fn(),
  buildCookieHeader: vi.fn(), SESSION_COOKIE: 'session', MAX_AGE: 100,
}));
vi.mock('@/lib/cli-token', () => ({ verifyTokenValue: vi.fn().mockReturnValue(false) }));
import { proxy } from '@/proxy';

describe('public translation access', () => {
  it('allows loading login translations without a session', async () => {
    const response = await proxy(new NextRequest('https://example.test/api/messages?locale=en'));
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });
  it('keeps cleanup and other APIs authenticated', async () => {
    for (const [path, method] of [['/api/browser-storage', 'POST'], ['/api/messages', 'POST'], ['/api/messages/private', 'GET']]) {
      const response = await proxy(new NextRequest(`https://example.test${path}`, { method }));
      expect(response.status).toBe(401);
    }
  });
});
