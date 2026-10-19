// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/zh-CN/notification.json';

vi.mock('next/router', () => ({ useRouter: () => ({ pathname: '/' }) }));
vi.mock('@/hooks/use-is-mobile', () => ({ default: () => true }));
vi.mock('@/hooks/use-layout', () => ({ useLayoutStore: (select: (value: unknown) => unknown) => select({ layout: null }), navigateToTab: vi.fn() }));
vi.mock('@/hooks/use-session-navigation', () => ({ navigateToSession: vi.fn() }));
vi.mock('@/components/features/workspace/session-history-actions', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
import { NotificationPanel } from '@/components/features/workspace/notification-sheet';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabStore from '@/hooks/use-tab-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { navigateToSession } from '@/hooks/use-session-navigation';
import type { ISessionWorkflow } from '@/lib/session-workflow';

const initial = { workspace: useWorkspaceStore.getState(), tabs: useTabStore.getState(), history: useSessionHistoryStore.getState() };
const fetchMock = vi.fn();
let root: Root, container: HTMLDivElement;
const workflow = (): ISessionWorkflow => ({ statuses: { 'codex:weekly': 'review', 'codex:patrol': 'in-progress' }, collapsed: {}, tagsRevision: 1,
  tags: [{ id: 'resident', name: '常驻助手', color: 'purple' }, { id: 'weekly', name: '周报', color: 'coral' }],
  sessionTags: { 'codex:weekly': ['resident', 'weekly'], 'codex:patrol': ['resident'] },
});
const button = (name: string, scope: ParentNode = document) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent === name || el.getAttribute('aria-label') === name)!;
const click = async (el: HTMLElement) => { expect(el).toBeTruthy(); await act(async () => el.click()); };
const fill = async (input: HTMLInputElement, text: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.clearAllMocks(); fetchMock.mockReset();
  useWorkspaceStore.setState({ workspaces: [{ id: 'ws', name: 'Work', directories: [] }], sessionWorkflow: workflow(), syncWorkspaces: vi.fn(async () => {}) });
  useTabStore.setState({ tabs: {} });
  useSessionHistoryStore.setState({ entries: ['weekly', 'patrol'].map((id) => ({
    id, workspaceId: 'ws', workspaceName: 'Work', workspaceDir: '/project', tabId: id, providerId: 'codex' as const, agentSessionId: id,
    prompt: id === 'weekly' ? '周报助手' : '巡检助手', result: 'Done', startedAt: 1, completedAt: 2, duration: 1, dismissedAt: null, toolUsage: {}, touchedFiles: [],
  })) });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  // eslint-disable-next-line react/no-children-prop -- The provider requires children in its createElement props type.
  await act(async () => root.render(createElement(NextIntlClientProvider, { locale: 'zh-CN', messages: { notification: messages },
    children: createElement(NotificationPanel, { workspaceLayouts: {} }) })));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  useWorkspaceStore.setState(initial.workspace); useTabStore.setState(initial.tabs); useSessionHistoryStore.setState(initial.history);
  vi.unstubAllGlobals();
});
describe('session tags UI', () => {
  it('exposes all 500 quick filters and supports filtering by the last tag', async () => {
    const tags = Array.from({ length: 500 }, (_, index) => ({ id: `tag-${index}`, name: `标签${index}`, color: 'purple' as const }));
    await act(async () => useWorkspaceStore.setState({ sessionWorkflow: { ...workflow(), tags, sessionTags: { 'codex:weekly': ['tag-499'] } } }));
    const filters = container.querySelector('[role="group"][aria-label="标签"]')!;
    expect(filters.querySelectorAll('button')).toHaveLength(501);
    await click(button('标签499', filters));
    expect(container.textContent).toContain('周报助手');
    expect(container.textContent).not.toContain('巡检助手');
    await click(button('移除标签499筛选', container));
    expect(container.querySelectorAll('select')).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('expands all 100 session tags in place without opening an editor or navigating', async () => {
    const tags = Array.from({ length: 100 }, (_, index) => ({ id: `tag-${index}`, name: `标签${index}`, color: 'purple' as const }));
    await act(async () => useWorkspaceStore.setState({ sessionWorkflow: { ...workflow(), tags, sessionTags: { 'codex:weekly': tags.map((tag) => tag.id) } } }));
    const cardTags = [...container.querySelectorAll('[data-session-tags]')].find((el) => el.textContent?.includes('+98'))!;
    await click(button('查看全部 100 个标签', cardTags));
    expect(cardTags.textContent).toContain('标签99');
    expect(cardTags.querySelectorAll('button[aria-label^="筛选标签："]')).toHaveLength(100);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(button('收起', cardTags).getAttribute('aria-expanded')).toBe('true');
    await click(button('收起', cardTags));
    expect(cardTags.textContent).not.toContain('标签99');
    await click(button('查看全部 100 个标签', cardTags));
    await click(button('筛选标签：标签99', cardTags));
    expect(container.querySelectorAll('select')).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(navigateToSession).not.toHaveBeenCalled();
  });
  it('opens management directly and preserves its search when returning from editing', async () => {
    await click(button('管理标签', container));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('所有会话共用');
    await fill(document.querySelector<HTMLInputElement>('input[aria-label="搜索标签…"]')!, '周报');
    await click(button('编辑周报标签'));
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('周报');
    await click(button('取消'));
    expect(document.querySelector<HTMLInputElement>('input[aria-label="搜索标签…"]')?.value).toBe('周报');
    await click(button('新建标签'));
    expect(document.querySelector<HTMLInputElement>('input[name="name"]')?.value).toBe('');
    await click(button('取消'));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('combines tags and text without modifying statuses or navigating', async () => {
    await click(button('常驻助手', container));
    expect(container.querySelectorAll('select')).toHaveLength(2);
    await click(button('筛选标签', container));
    const options = document.querySelectorAll<HTMLInputElement>('[role="dialog"] input[type="checkbox"]');
    await click(options[1]);
    await click(button('完成', document.querySelector('[role="dialog"]')!));
    expect(container.querySelectorAll('select')).toHaveLength(1);
    expect(container.textContent).toContain('同时包含');
    expect(container.textContent).toContain('周报助手');
    await fill(container.querySelector('input')!, '不存在');
    expect(container.textContent).toContain('没有匹配的会话');
    await click(button('清除全部筛选', container));
    expect(container.querySelectorAll('select')).toHaveLength(2);
    expect(useWorkspaceStore.getState().sessionWorkflow.statuses).toEqual(workflow().statuses);
    expect(navigateToSession).not.toHaveBeenCalled();
  });
  it('discards newly created tag drafts on cancel', async () => {
    await click(button('编辑周报助手的标签', container));
    await fill(document.querySelector<HTMLInputElement>('input[aria-label="搜索或创建标签…"]')!, '月度复盘');
    await click(button('创建「月度复盘」'));
    await click(button('取消'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().sessionWorkflow).toEqual(workflow());
  });
  it('keeps drafts on save failure and atomically saves them on retry', async () => {
    await click(button('编辑周报助手的标签', container));
    await fill(document.querySelector<HTMLInputElement>('input[aria-label="搜索或创建标签…"]')!, '月度复盘');
    await click(button('创建「月度复盘」'));
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ code: 'saveFailed' }) });
    await click(button('保存'));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('草稿已保留');
    expect(useWorkspaceStore.getState().sessionWorkflow).toEqual(workflow());
    const update = JSON.parse(fetchMock.mock.calls[0][1].body);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...workflow(), tags: [...workflow().tags!, ...update.newTags], tagsRevision: 2, sessionTags: { ...workflow().sessionTags, [update.key]: update.tagIds } }) });
    await click(button('重试保存'));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual(update);
    expect(useWorkspaceStore.getState().sessionWorkflow.tags).toHaveLength(3);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(navigateToSession).not.toHaveBeenCalled();
  });
  it('shows conflicts without overwriting the draft or a remote edit', async () => {
    await click(button('编辑周报助手的标签', container));
    await fill(document.querySelector<HTMLInputElement>('input[aria-label="搜索或创建标签…"]')!, '保留的草稿');
    await act(async () => useWorkspaceStore.setState({ sessionWorkflow: { ...workflow(), tagsRevision: 2 } }));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('关闭后重新打开');
    expect(document.querySelector<HTMLInputElement>('input[aria-label="搜索或创建标签…"]')?.value).toBe('保留的草稿');
    expect(button('保存').disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('removes remotely deleted filters and reflects renamed tags immediately', async () => {
    await click(button('周报', container));
    expect(container.querySelectorAll('select')).toHaveLength(1);
    await act(async () => useWorkspaceStore.setState({ sessionWorkflow: { ...workflow(), tagsRevision: 2, tags: [{ id: 'resident', name: '长期助手', color: 'purple' }], sessionTags: { 'codex:patrol': ['resident'] } } }));
    expect(container.querySelectorAll('select')).toHaveLength(2);
    expect(container.textContent).toContain('长期助手');
  });
});
