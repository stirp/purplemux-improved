import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';
import { verifySessionToken, SESSION_COOKIE } from '@/lib/auth';
import { getCachedPreflightStatus } from '@/lib/preflight';
import { getConfig } from '@/lib/config-store';
import { toPublicConfig } from '@/lib/public-config';

interface IRequireAuthOptions {
  skipPreflight?: boolean;
}

export const requireAuth = async <T extends Record<string, unknown>>(
  context: GetServerSidePropsContext,
  handler?: () => Promise<GetServerSidePropsResult<T>>,
  options?: IRequireAuthOptions,
): Promise<GetServerSidePropsResult<T>> => {
  const token = context.req.cookies[SESSION_COOKIE];
  if (!token || !(await verifySessionToken(token))) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  if (!options?.skipPreflight) {
    const runtime = await getCachedPreflightStatus();
    if (!(runtime.tmux.installed && runtime.tmux.compatible && runtime.git.installed)) {
      const from = context.resolvedUrl || '/';
      return { redirect: { destination: `/tools-required?from=${encodeURIComponent(from)}`, permanent: false } };
    }
  }

  const result = handler ? await handler() : ({ props: {} } as GetServerSidePropsResult<T>);

  if ('props' in result && result.props && !(result.props instanceof Promise)) {
    const props = result.props as Record<string, unknown>;
    props.isElectron = /Electron/i.test(context.req.headers['user-agent'] ?? '');
    if (!props.initialConfig) {
      const { isBoundToLocalhostOnly } = await import('@/lib/access-filter');
      props.initialConfig = {
        ...toPublicConfig(await getConfig()),
        hostEnvLocked: typeof process.env.HOST === 'string' && process.env.HOST.trim().length > 0,
        bindHostIsLocal: isBoundToLocalhostOnly(),
      };
    }
  }

  return result;
};
