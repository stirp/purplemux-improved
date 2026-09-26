import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';
import { loadClientMessages } from '@/lib/load-client-messages';
import workspace from '../../../messages/zh-CN/workspace.json';

afterEach(() => vi.unstubAllGlobals());

describe('client translation loading', () => {
  it('preserves current server messages instead of overwriting newly added keys with compiled chunks', async () => {
    const current = { workspace: { ...workspace, newlyAdded: '新词条' } };
    const messages = await loadClientMessages('zh-CN', 'zh-CN', current);
    expect(messages).toBe(current);
    const translate = createTranslator({ locale: 'zh-CN', messages: messages as typeof current, namespace: 'workspace.worktree' });
    expect(translate('create')).toBe('创建 Git 工作树子任务');
  });
  it('loads the selected language when it differs from the server language', async () => {
    const fresh = { workspace: { newlyAdded: 'Fresh translation' } };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => fresh });
    vi.stubGlobal('fetch', fetch);
    const messages = await loadClientMessages('en', 'zh-CN', { workspace });
    expect(messages).toEqual(fresh);
    expect(fetch).toHaveBeenCalledWith('/api/messages?locale=en', { cache: 'no-store' });
  });
  it('loads translations when a page has no server messages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ workspace }) }));
    const messages = await loadClientMessages('zh-CN', 'zh-CN');
    expect((messages.workspace.worktree as Record<string, string>).create).toBe('创建 Git 工作树子任务');
  });
  it('surfaces fetch failures instead of silently showing an old compiled catalog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(loadClientMessages('en', 'zh-CN')).rejects.toThrow('Failed to load translations');
  });
});
