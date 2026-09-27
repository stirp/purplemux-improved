import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import useConfigStore from '@/hooks/use-config-store';
import { DEFAULT_BRANCH_NAME_PROMPT } from '@/lib/branch-name-prompt';
const mocks = vi.hoisted(() => ({ getConfig: vi.fn(), updateConfig: vi.fn() }));
vi.mock('@/lib/config-store', () => ({ ...mocks, hashPassword: vi.fn(), generateSecret: vi.fn() }));
vi.mock('@/lib/access-filter', () => ({ isBoundToLocalhostOnly: () => true, updateAccessFromConfig: vi.fn() }));
import handler from '@/pages/api/config';

const saved = { branchNameProvider: 'codex' as const, branchNamePrompt: 'Task: {{title}}' };
async function call(body: unknown, method = 'PATCH') {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  await handler({ body, method } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
}
beforeEach(() => { vi.clearAllMocks(); useConfigStore.getState().hydrate({}); });
afterEach(() => vi.unstubAllGlobals());

describe('branch name configuration', () => {
  it('saves both settings and returns them on reload', async () => {
    const supported = { ...saved, branchNameProvider: 'claude' };
    expect((await call(supported)).status).toHaveBeenCalledWith(200);
    expect(mocks.updateConfig).toHaveBeenCalledWith(supported);
    // Keep old persisted selections visible so users can explicitly change them.
    mocks.getConfig.mockResolvedValue(saved);
    expect((await call(undefined, 'GET')).json).toHaveBeenCalledWith(expect.objectContaining(saved));
  });
  it.each([{ branchNameProvider: 'codex' }, { branchNameProvider: 'unknown' }, { branchNamePrompt: '{{unknown}}' }, { branchNamePrompt: null }, { branchNamePrompt: '' }])('rejects invalid settings: %j', async (body) => {
    expect((await call(body)).status).toHaveBeenCalledWith(400);
    expect(mocks.updateConfig).not.toHaveBeenCalled();
  });
  it('hydrates defaults and only updates client state after saving successfully', async () => {
    expect(useConfigStore.getState().branchNamePrompt).toBe(DEFAULT_BRANCH_NAME_PROMPT);
    expect(useConfigStore.getState().branchNameProvider).toBe('claude');
    const fetch = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    await useConfigStore.getState().setBranchNameSettings(saved.branchNameProvider, saved.branchNamePrompt);
    expect(fetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({ body: JSON.stringify(saved) }));
    expect(useConfigStore.getState()).toMatchObject(saved);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Save failed' }) })));
    await expect(useConfigStore.getState().setBranchNameSettings('claude', 'New prompt')).rejects.toThrow('Save failed');
    expect(useConfigStore.getState()).toMatchObject(saved);
    useConfigStore.getState().hydrate(saved);
    expect(useConfigStore.getState()).toMatchObject(saved);
  });
});
