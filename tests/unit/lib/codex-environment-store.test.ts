import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useConfigStore from '@/hooks/use-config-store';

beforeEach(() => {
  useConfigStore.getState().hydrate({});
});
afterEach(() => vi.unstubAllGlobals());

describe('saving Codex environment', () => {
  it('supports older configuration without the new field', async () => {
    const fetch = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    expect(useConfigStore.getState().codexEnvironment).toEqual({});
    const env = { HTTPS_PROXY: 'http://localhost:7890' };
    await useConfigStore.getState().setCodexEnvironment(env);
    expect(fetch).toHaveBeenCalledWith('/api/config', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codexEnvironment: env }),
    });
    expect(useConfigStore.getState().codexEnvironment).toEqual(env);
  });

  it.each([401, 400, 500])('reports HTTP %i and preserves saved values', async (status) => {
    const previous = { HTTPS_PROXY: 'previous' };
    useConfigStore.getState().hydrate({ codexEnvironment: previous });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status, json: async () => ({ error: 'Request failed' }),
    })));
    await expect(useConfigStore.getState().setCodexEnvironment({ HTTPS_PROXY: 'new' }))
      .rejects.toThrow(`HTTP ${status}: Request failed`);
    expect(useConfigStore.getState().codexEnvironment).toEqual(previous);
  });

  it('reports the status even if the server returns HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 500, json: async () => { throw new Error('Invalid JSON'); },
    })));
    await expect(useConfigStore.getState().setCodexEnvironment({ NAME: 'new' })).rejects.toThrow('HTTP 500');
  });
});

it('saves and clears Claude without modifying Codex', async () => {
  const codex = { HTTPS_PROXY: 'codex' };
  useConfigStore.getState().hydrate({ codexEnvironment: codex });
  const fetch = vi.fn(async (_url: string, _options: { body: string }) => ({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  const environments: Record<string, string>[] = [{ HTTPS_PROXY: 'claude' }, {}];
  for (const env of environments) {
    await useConfigStore.getState().setClaudeEnvironment(env);
    expect(JSON.parse(fetch.mock.calls.at(-1)![1].body)).toEqual({ claudeEnvironment: env });
    expect(useConfigStore.getState().claudeEnvironment).toEqual(env);
    expect(useConfigStore.getState().codexEnvironment).toEqual(codex);
  }
});

it('preserves both agents when saving Claude fails', async () => {
  const previous = { claudeEnvironment: { TOKEN: 'claude' }, codexEnvironment: { TOKEN: 'codex' } };
  useConfigStore.getState().hydrate(previous);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
  await expect(useConfigStore.getState().setClaudeEnvironment({})).rejects.toThrow('HTTP 500');
  expect(useConfigStore.getState()).toMatchObject(previous);
});


it.each(['claude', 'codex'] as const)('skips unchanged %s environment including reordered keys', async (provider) => {
  const saved = { FIRST: 'one', SECOND: 'two' };
  useConfigStore.getState().hydrate({ claudeEnvironment: saved, codexEnvironment: saved });
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await useConfigStore.getState().setAgentEnvironment(provider, { SECOND: 'two', FIRST: 'one' });
  expect(fetch).not.toHaveBeenCalled();
  useConfigStore.getState().hydrate({});
  await useConfigStore.getState().setAgentEnvironment(provider, {});
  expect(fetch).not.toHaveBeenCalled();
});
