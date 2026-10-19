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
const key = async (code: string) => {
  await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', {
    code, key: code === 'Space' ? ' ' : code, bubbles: true, cancelable: true,
  })); });
};
const startDrag = async (name = '常驻助手') => {
  const handle = button(`调整${name}的顺序`);
  await act(async () => handle.focus());
  await key('Space');
  // The real KeyboardSensor attaches its document listener on the next timer tick.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(document.activeElement).toBe(handle);
  expect(button('关闭').disabled).toBe(true);
};
const reorder = async () => {
  await startDrag();
  await key('ArrowDown');
  await key('Space');
};
const managerOrder = () => [...document.querySelectorAll('button[aria-label^="调整"]')].map((button) => button.getAttribute('aria-label'));
const fill = async (input: HTMLInputElement, text: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  // jsdom has no layout; supply row geometry while keeping Dialog and dnd-kit event handling real.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const rows = [...document.querySelectorAll('button[aria-label^="调整"]')].map((handle) => handle.parentElement!);
    const index = rows.findIndex((row) => row === this || row.contains(this));
    const top = Math.max(0, index) * 100;
    return { x: 0, y: top, top, bottom: top + 80, left: 0, right: 400, width: 400, height: 80, toJSON: () => ({}) };
  });
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
  vi.restoreAllMocks();
});
describe('session tags UI', () => {
  it('keeps ordering as a draft, cancels it and synchronizes saved order across selectors', async () => {
    await click(button('管理标签', container));
    await reorder();
    expect(managerOrder()).toEqual(['调整周报的顺序', '调整常驻助手的顺序']);
    expect(button('新建标签').disabled).toBe(true);
    expect(button('编辑周报标签').disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().sessionWorkflow.tags).toEqual(workflow().tags);
    await click(button('取消排序'));
    expect(managerOrder()).toEqual(['调整常驻助手的顺序', '调整周报的顺序']);
    await reorder();
    const saved = { ...workflow(), tags: [...workflow().tags!].reverse(), tagsRevision: 2 };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => saved });
    await click(button('保存排序'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'reorder', revision: 1, tagIds: ['weekly', 'resident'] });
    expect(useWorkspaceStore.getState().sessionWorkflow.sessionTags).toEqual(workflow().sessionTags);
    await click(button('完成'));
    expect([...container.querySelectorAll('[role="group"][aria-label="标签"] button')].map((button) => button.textContent)).toEqual(['全部', '周报', '常驻助手']);
    await click(button('筛选标签', container));
    expect([...document.querySelectorAll('[role="dialog"] label')].map((label) => label.textContent)).toEqual(['周报1', '常驻助手2']);
    await click(button('完成', document.querySelector('[role="dialog"]')!));
    await click(button('编辑周报助手的标签', container));
    expect([...document.querySelectorAll('[role="dialog"] label')].map((label) => label.textContent)).toEqual(['周报', '常驻助手']);
  });
  it('preserves failed order drafts for retry', async () => {
    await click(button('管理标签', container));
    await reorder();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ code: 'saveFailed' }) });
    await click(button('保存排序'));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('草稿已保留');
    expect(managerOrder()).toEqual(['调整周报的顺序', '调整常驻助手的顺序']);
    expect(useWorkspaceStore.getState().sessionWorkflow.tags).toEqual(workflow().tags);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...workflow(), tags: [...workflow().tags!].reverse(), tagsRevision: 2 }) });
    await click(button('重试保存'));
    expect(fetchMock.mock.calls[1][1].body).toEqual(fetchMock.mock.calls[0][1].body);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it('captures the drag-start revision and rejects overwriting a remote catalog change', async () => {
    await click(button('管理标签', container));
    await startDrag();
    await act(async () => useWorkspaceStore.setState({ sessionWorkflow: { ...workflow(), tagsRevision: 2, tags: [...workflow().tags!, { id: 'new', name: '新增', color: 'green' }] } }));
    await key('ArrowDown');
    await key('Space');
    expect(button('保存排序').disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('其他位置更新');
    await click(button('取消排序'));
    expect(managerOrder()).toEqual(['调整常驻助手的顺序', '调整周报的顺序', '调整新增的顺序']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('disables sorting while searching and discards drafts on close', async () => {
    await click(button('管理标签', container));
    await fill(document.querySelector<HTMLInputElement>('input[aria-label="搜索标签…"]')!, '周报');
    expect(button('调整周报的顺序').disabled).toBe(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('清空搜索后');
    await fill(document.querySelector<HTMLInputElement>('input[aria-label="搜索标签…"]')!, '');
    await reorder();
    await click(button('关闭'));
    await click(button('管理标签', container));
    expect(managerOrder()).toEqual(['调整常驻助手的顺序', '调整周报的顺序']);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('cancels a keyboard drag with Escape, preserves earlier drafts and only closes when idle', async () => {
    await click(button('管理标签', container));
    await startDrag();
    await key('ArrowDown');
    await key('Escape');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(button('关闭').disabled).toBe(false);
    expect(button('新建标签').disabled).toBe(false);
    expect(managerOrder()).toEqual(['调整常驻助手的顺序', '调整周报的顺序']);
    expect(button('保存排序')).toBeUndefined();
    await reorder();
    await startDrag();
    await key('ArrowUp');
    await key('Escape');
    expect(managerOrder()).toEqual(['调整周报的顺序', '调整常驻助手的顺序']);
    expect(button('保存排序').disabled).toBe(false);
    await key('Escape');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not announce a false conflict while a successful save waits for workspace sync', async () => {
    await click(button('管理标签', container));
    await reorder();
    let finishSync!: () => void;
    const syncGate = new Promise<void>((resolve) => { finishSync = resolve; });
    useWorkspaceStore.setState({ syncWorkspaces: vi.fn(() => syncGate) });
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ...workflow(), tags: [...workflow().tags!].reverse(), tagsRevision: 2 }) });
    await click(button('保存排序'));
    expect(useWorkspaceStore.getState().sessionWorkflow.tagsRevision).toBe(2);
    expect(button('保存中…').disabled).toBe(true);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    await key('Escape');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await act(async () => finishSync());
    expect(button('完成').disabled).toBe(false);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it('retains the draft and blocks saving after a real server conflict', async () => {
    await click(button('管理标签', container));
    await reorder();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ code: 'conflict' }) });
    await click(button('保存排序'));
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('其他位置更新');
    expect(button('重试保存').disabled).toBe(true);
    expect(managerOrder()).toEqual(['调整周报的顺序', '调整常驻助手的顺序']);
    await click(button('取消排序'));
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(button('调整常驻助手的顺序').disabled).toBe(false);
  });
  it('saves a new palette color and restores its selection when reopened', async () => {
    await click(button('管理标签', container));
    await click(button('编辑常驻助手标签'));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.querySelectorAll('input[type="radio"]')).toHaveLength(9);
    await click(dialog.querySelector<HTMLInputElement>('input[value="blue"]')!);
    const updated = { ...workflow(), tagsRevision: 2, tags: workflow().tags!.map((tag) => tag.id === 'resident' ? { ...tag, color: 'blue' as const } : tag) };
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => updated });
    await click(button('保存'));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ action: 'update', revision: 1, tag: { id: 'resident', name: '常驻助手', color: 'blue' } });
    expect(useWorkspaceStore.getState().sessionWorkflow.sessionTags).toEqual(workflow().sessionTags);
    expect(useWorkspaceStore.getState().sessionWorkflow.statuses).toEqual(workflow().statuses);
    await click(button('编辑常驻助手标签'));
    expect(document.querySelector<HTMLInputElement>('input[value="blue"]')?.checked).toBe(true);
    await click(button('取消'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  // Rendering and updating 500 real buttons exceeded 5s under parallel load; keep headroom for this stress case only.
  it('exposes all 500 quick filters and supports filtering by the last tag', { timeout: 15_000 }, async () => {
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
