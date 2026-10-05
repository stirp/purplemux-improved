import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toPublicConfig } from '@/lib/public-config';

const mocks = vi.hoisted(() => ({
  writeFile: vi.fn(), rename: vi.fn(), broadcastSync: vi.fn(),
}));
vi.mock('fs/promises', () => ({ default: { writeFile: mocks.writeFile, rename: mocks.rename } }));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: mocks.broadcastSync }));
import { writeConfig } from '@/lib/config-store';

beforeEach(() => vi.clearAllMocks());
describe('public configuration snapshots', () => {
  it('excludes authentication secrets in the shared API and WebSocket projection', () => {
    const publicConfig = toPublicConfig({ authPassword: 'password-hash', authSecret: 'secret', locale: 'zh-CN', updatedAt: '2026-10-05T00:00:00.000Z' });
    expect(publicConfig).toEqual({ hasAuthPassword: true, locale: 'zh-CN', updatedAt: '2026-10-05T00:00:00.000Z' });
    expect(JSON.stringify(publicConfig)).not.toContain('password-hash');
    expect(JSON.stringify(publicConfig)).not.toContain('secret');
  });

  it('broadcasts a complete safe snapshot and increments timestamps within the same millisecond', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-05T00:00:00.000Z'));
    try {
      const data = { authSecret: 'secret', authPassword: 'hash', fontSize: 'large', customCSS: 'body{}', updatedAt: '2026-10-05T00:00:00.000Z' };
      await writeConfig(data);
      const first = data.updatedAt;
      expect(mocks.broadcastSync).toHaveBeenLastCalledWith({ type: 'config', config: { hasAuthPassword: true, fontSize: 'large', customCSS: 'body{}', updatedAt: first } });
      data.fontSize = 'normal';
      await writeConfig(data);
      expect(Date.parse(data.updatedAt)).toBeGreaterThan(Date.parse(first));
      expect(mocks.broadcastSync).toHaveBeenLastCalledWith({ type: 'config', config: expect.objectContaining({ fontSize: 'normal', updatedAt: data.updatedAt }) });
    } finally {
      clock.mockRestore();
    }
  });
});
