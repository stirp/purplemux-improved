import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() }) }));

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(async () => ({} as { codexEnvironment?: Record<string, string> })),
  updateConfig: vi.fn(),
  buildArgs: vi.fn(async () => ['--test']),
}));
vi.mock('@/lib/config-store', () => ({ ...mocks, hashPassword: vi.fn(), generateSecret: vi.fn() }));
vi.mock('@/lib/access-filter', () => ({ isBoundToLocalhostOnly: () => true, updateAccessFromConfig: vi.fn() }));
vi.mock('@/lib/providers/codex', () => ({ buildCodexRuntimeArgs: mocks.buildArgs }));
vi.mock('@/lib/workspace-store', () => ({ getActiveWorkspaceId: async () => 'active' }));
import configHandler from '@/pages/api/config';
import launchHandler from '@/pages/api/codex/launch-args';

const response = () => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConfig.mockResolvedValue({});
});

describe('Codex environment API', () => {
  it.each([{ HTTPS_PROXY: 'http://localhost:7890', EMPTY: '' }, {}])('persists overrides and supports clearing: %j', async (env) => {
    const res = response();
    await configHandler({ method: 'PATCH', body: { codexEnvironment: env } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.updateConfig).toHaveBeenCalledWith({ codexEnvironment: env });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each([null, [], { NAME: 4 }, { 'BAD=NAME': 'value' }, { NAME: '\0' }])('rejects invalid configuration: %j', async (env) => {
    const res = response();
    await configHandler({ method: 'PATCH', body: { codexEnvironment: env } } as NextApiRequest, res as unknown as NextApiResponse);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns persisted configuration on reload', async () => {
    const env = { HTTPS_PROXY: 'proxy' };
    mocks.getConfig.mockResolvedValue({ codexEnvironment: env });
    const res = response();
    await configHandler({ method: 'GET' } as NextApiRequest, res as unknown as NextApiResponse);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ codexEnvironment: env }));
  });

  it('reads the latest environment on each launch or resume', async () => {
    const environments: Record<string, string>[] = [{ HTTPS_PROXY: 'proxy' }, {}];
    for (const env of environments) {
      mocks.getConfig.mockResolvedValue({ codexEnvironment: env });
      const res = response();
      await launchHandler({ method: 'POST', body: { workspaceId: 'ws', resumeSessionId: 'session' } } as NextApiRequest, res as unknown as NextApiResponse);
      expect(res.json).toHaveBeenCalledWith({ args: ['--test'], env });
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    }
    expect(mocks.buildArgs).toHaveBeenCalledWith('ws', 'session');
  });
});
