import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import { loadClientMessages } from '@/lib/load-client-messages';
import workspace from '../../../messages/zh-CN/workspace.json';

describe('client translation loading', () => {
  it('preserves current server messages instead of overwriting newly added keys with compiled chunks', async () => {
    const current = { workspace: { ...workspace, newlyAdded: '新词条' } };
    const messages = await loadClientMessages('zh-CN', 'zh-CN', current);
    expect(messages).toBe(current);
    const translate = createTranslator({ locale: 'zh-CN', messages: messages as typeof current, namespace: 'workspace.worktree' });
    expect(translate('create')).toBe('创建 Git 工作树子任务');
  });
  it('loads the selected language when it differs from the server language', async () => {
    const messages = await loadClientMessages('en', 'zh-CN', { workspace });
    expect((messages.workspace.worktree as Record<string, string>).create).toBe('Create worktree subtask');
  });
  it('loads translations when a page has no server messages', async () => {
    const messages = await loadClientMessages('zh-CN', 'zh-CN');
    expect((messages.workspace.worktree as Record<string, string>).create).toBe('创建 Git 工作树子任务');
  });
});
