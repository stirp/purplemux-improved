import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextApiRequest, NextApiResponse } from 'next';
import useConfigStore from '@/hooks/use-config-store';
import { GIT_GENERATION_PROMPTS, isValidGitGenerationPrompt, renderGitGenerationPrompt } from '@/lib/git-generation-prompts';
const mocks = vi.hoisted(() => ({ getConfig: vi.fn(), updateConfig: vi.fn() }));
vi.mock('@/lib/config-store', () => ({ ...mocks, hashPassword: vi.fn(), generateSecret: vi.fn() }));
vi.mock('@/lib/access-filter', () => ({ isBoundToLocalhostOnly: () => true, updateAccessFromConfig: vi.fn() }));
import handler from '@/pages/api/config';

const call = async (body: unknown, method = 'PATCH') => {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() }; res.status.mockReturnValue(res);
  await handler({ body, method } as NextApiRequest, res as unknown as NextApiResponse);
  return res;
};
beforeEach(() => { vi.resetAllMocks(); useConfigStore.getState().hydrate({}); });
afterEach(() => vi.unstubAllGlobals());

describe('Git generation prompt templates', () => {
  it('renders supported variables once, preserving literal replacement characters and embedded placeholders in data', () => {
    expect(renderGitGenerationPrompt('commitMessagePrompt', '{{ locale }}: {{branch}}', { locale: 'zh-CN', branch: 'feat/$&{{locale}}' })).toBe('zh-CN: feat/$&{{locale}}');
    expect(renderGitGenerationPrompt('reviewDescriptionPrompt', '{{sourceBranch}} -> {{targetBranch}} ({{locale}})', {
      sourceBranch: 'feat/example', targetBranch: 'main', locale: 'en',
    })).toBe('feat/example -> main (en)');
    expect(() => renderGitGenerationPrompt('commitMessagePrompt', '{{unknown}}', {})).toThrow('Unknown prompt variable');
  });

  it.each(['commitMessagePrompt', 'reviewDescriptionPrompt'] as const)('validates, persists, hydrates, and resets %s independently', async (key) => {
    const defaultPrompt = GIT_GENERATION_PROMPTS[key].defaultPrompt;
    expect(isValidGitGenerationPrompt(key, defaultPrompt)).toBe(true);
    expect(useConfigStore.getState()[key]).toBe(defaultPrompt);
    const custom = 'Write in {{locale}}. Use concise bullet points.';
    expect((await call({ [key]: custom })).status).toHaveBeenCalledWith(200);
    expect(mocks.updateConfig).toHaveBeenLastCalledWith({ [key]: custom });
    mocks.getConfig.mockResolvedValue({ [key]: custom, authSecret: 'secret', authPassword: 'hash' });
    const read = await call(undefined, 'GET');
    expect(read.json).toHaveBeenCalledWith(expect.objectContaining({ [key]: custom }));
    expect(read.json.mock.calls[0][0]).not.toHaveProperty('authSecret');

    const fetch = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    await useConfigStore.getState().setGitGenerationPrompt(key, custom);
    expect(fetch).toHaveBeenCalledWith('/api/config', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ [key]: custom }) }));
    expect(useConfigStore.getState()[key]).toBe(custom);
    const other = key === 'commitMessagePrompt' ? 'reviewDescriptionPrompt' : 'commitMessagePrompt';
    expect(useConfigStore.getState()[other]).toBe(GIT_GENERATION_PROMPTS[other].defaultPrompt);
    useConfigStore.getState().hydrate({ [key]: custom });
    expect(useConfigStore.getState()[key]).toBe(custom);

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'Save failed' }) })));
    await expect(useConfigStore.getState().setGitGenerationPrompt(key, 'Different')).rejects.toThrow('Save failed');
    expect(useConfigStore.getState()[key]).toBe(custom);
    vi.stubGlobal('fetch', fetch);
    await useConfigStore.getState().setGitGenerationPrompt(key, defaultPrompt);
    expect(useConfigStore.getState()[key]).toBe(defaultPrompt);
  });

  it.each(['commitMessagePrompt', 'reviewDescriptionPrompt'] as const)('rejects invalid %s without saving other updates', async (key) => {
    for (const value of ['', '   ', null, 123, '{{unknown}}', '{{locale', '{{}}', 'x'.repeat(10001), 'bad\0prompt']) {
      expect(isValidGitGenerationPrompt(key, value)).toBe(false);
      expect((await call({ [key]: value, fontSize: 'large' })).status).toHaveBeenCalledWith(400);
    }
    expect(mocks.updateConfig).not.toHaveBeenCalled();
    expect(isValidGitGenerationPrompt(key, 'x'.repeat(10000))).toBe(true);
  });
});
