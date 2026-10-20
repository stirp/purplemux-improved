import type { GetServerSidePropsContext } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAuth } from '@/lib/require-auth';
import { getServerSideProps as statsProps } from '@/pages/stats';
import { getServerSideProps as reportsProps } from '@/pages/reports';
import { getServerSideProps as webviewProps } from '@/pages/webview';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), preflight: vi.fn(), getConfig: vi.fn() }));
vi.mock('@/lib/auth', () => ({ SESSION_COOKIE: 'session', verifySessionToken: mocks.verify }));
vi.mock('@/lib/preflight', () => ({ getCachedPreflightStatus: mocks.preflight }));
vi.mock('@/lib/config-store', () => ({ getConfig: mocks.getConfig }));
vi.mock('@/lib/access-filter', () => ({ isBoundToLocalhostOnly: () => true }));
vi.mock('@/lib/load-messages', () => ({ loadMessagesServer: async () => ({ header: {} }) }));
vi.mock('@/components/layout/page-shell', () => ({ getPageShellWithTitlebarLayout: vi.fn() }));

const context = (url = '/stats') => ({ req: { cookies: { session: 'valid' }, headers: {} }, resolvedUrl: url }) as unknown as GetServerSidePropsContext;
const saved = { updatedAt: '2026-10-21T00:00:00Z', systemResourcesEnabled: false, locale: 'zh-CN', authSecret: 'secret', authPassword: 'hash' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.verify.mockResolvedValue({});
  mocks.preflight.mockResolvedValue({ tmux: { installed: true, compatible: true }, git: { installed: true } });
  mocks.getConfig.mockResolvedValue(saved);
});

describe('authenticated page configuration', () => {
  it.each([['/stats', statsProps], ['/reports', reportsProps], ['/webview', webviewProps]] as const)(
    'supplies the saved monitor setting and excludes secrets on direct %s loads', async (url, getProps) => {
      const result = await getProps(context(url));
      expect(result).toMatchObject({ props: { initialConfig: {
        systemResourcesEnabled: false, locale: 'zh-CN', hasAuthPassword: true,
        hostEnvLocked: typeof process.env.HOST === 'string' && process.env.HOST.trim().length > 0,
        bindHostIsLocal: true,
      } } });
      expect(JSON.stringify(result)).not.toContain('authSecret');
      expect(JSON.stringify(result)).not.toContain('"authPassword"');
      expect(mocks.getConfig).toHaveBeenCalledTimes(1);
    },
  );
  it('preserves the existing home snapshot including derived host flags', async () => {
    const initialConfig = { systemResourcesEnabled: false, hostEnvLocked: true, bindHostIsLocal: true };
    const result = await requireAuth(context('/'), async () => ({ props: { initialConfig } }));
    expect(result).toMatchObject({ props: { initialConfig } });
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });
  it('does not read configuration for unauthenticated visitors', async () => {
    mocks.verify.mockResolvedValue(null);
    const handler = vi.fn();
    expect(await requireAuth(context(), handler)).toEqual({ redirect: { destination: '/login', permanent: false } });
    expect(handler).not.toHaveBeenCalled();
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });
  it('keeps failed preflight redirects ahead of configuration reads', async () => {
    mocks.preflight.mockResolvedValue({ tmux: { installed: false, compatible: false }, git: { installed: true } });
    expect(await requireAuth(context())).toMatchObject({ redirect: { destination: '/tools-required?from=%2Fstats' } });
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });
  it.each([{ redirect: { destination: '/', permanent: false } }, { notFound: true as const }])('does not add configuration to non-page results: %j', async (result) => {
    expect(await requireAuth(context(), async () => result)).toBe(result);
    expect(mocks.getConfig).not.toHaveBeenCalled();
  });
});
