// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import useLayout, { setOnFetchError, useLayoutStore } from '@/hooks/use-layout';
import useWorkspaceLayoutStore from '@/hooks/use-workspace-layout-store';
import type { ILayoutData, IPaneNode } from '@/types/terminal';

vi.mock('next/router', () => ({ default: { pathname: '/' } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
vi.mock('@/hooks/use-web-input', () => ({ clearInputDraft: vi.fn() }));

const initial = useLayoutStore.getState();
const fetchMock = vi.fn();
const response = (data: ILayoutData) => ({ ok: true, json: async () => data });
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const layout = (id: string): ILayoutData => ({
  root: { type: 'pane', id: `pane-${id}`, activeTabId: `${id}-1`, tabs: [1, 2].map((n) => ({
    id: `${id}-${n}`, sessionName: `session-${id}-${n}`, name: `Tab ${n}`, order: n,
  })) }, activePaneId: `pane-${id}`, updatedAt: id,
});
const pane = () => useLayoutStore.getState().layout!.root as IPaneNode;
const switchTo = (id: string) => {
  useLayoutStore.getState().clearLayout();
  useLayoutStore.getState().setWorkspaceId(id);
};

beforeEach(() => {
  useLayoutStore.getState().clearLayout();
  useLayoutStore.setState(initial, true);
  useWorkspaceLayoutStore.setState({ layouts: {} });
  sessionStorage.clear();
  setOnFetchError(null);
  vi.clearAllMocks();
  fetchMock.mockReset().mockImplementation(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  useLayoutStore.getState().clearLayout();
  useLayoutStore.setState(initial, true);
  useWorkspaceLayoutStore.setState({ layouts: {} });
  setOnFetchError(null);
  vi.unstubAllGlobals();
});

describe('workspace switching without waiting for layout revalidation', () => {
  it('renders cached B immediately through the real hook while its network request is pending', async () => {
    useLayoutStore.getState().setWorkspaceId('a');
    useLayoutStore.getState().setLayout(layout('a'));
    useWorkspaceLayoutStore.getState().setLayout('b', layout('b'));
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(pending.promise);
    const renders: Array<string | null> = [];
    const Harness = ({ id }: { id: string }) => {
      const state = useLayout({ workspaceId: id });
      renders.push(state.layout?.activePaneId ?? null);
      return createElement('div', null, state.isLoading ? 'loading' : state.layout?.activePaneId);
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(Harness, { id: 'b' })));
      expect(container.textContent).toBe('pane-b');
      expect(renders).not.toContain('pane-a');
      expect(fetchMock).toHaveBeenCalledWith('/api/layout?workspace=b', expect.anything());
      await act(async () => pending.resolve(response(layout('b'))));
      expect(container.textContent).toBe('pane-b');
    } finally {
      await act(async () => root.unmount());
    }
  });

  it('keeps cold workspaces empty until their own request completes', async () => {
    useLayoutStore.getState().setWorkspaceId('a');
    useLayoutStore.getState().setLayout(layout('a'));
    switchTo('cold');
    expect(useLayoutStore.getState()).toMatchObject({ layout: null, isLoading: true });
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(pending.promise);
    const loading = useLayoutStore.getState().fetchLayout();
    pending.resolve(response(layout('cold')));
    await loading;
    expect(pane().id).toBe('pane-cold');
    expect(useLayoutStore.getState().isLoading).toBe(false);
  });

  it('retains local tab and terminal preferences across A → B → A, including a late tab save', async () => {
    useLayoutStore.getState().setWorkspaceId('a');
    useLayoutStore.getState().setLayout(layout('a'));
    const save = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(save.promise);
    useLayoutStore.getState().switchTabInPane('pane-a', 'a-2');
    sessionStorage.setItem('pt-terminal-ratio-a-2', '0.4');
    sessionStorage.setItem('pt-terminal-collapsed-a-2', '0');
    useWorkspaceLayoutStore.getState().setLayout('b', layout('b'));
    switchTo('b');
    save.resolve(response(layout('a')));
    await save.promise;
    await Promise.resolve();
    expect(pane().id).toBe('pane-b');
    switchTo('a');
    expect(pane().activeTabId).toBe('a-2');
    expect(pane().tabs[1]).toMatchObject({ terminalRatio: 0.4, terminalCollapsed: false });
  });

  it('discards delayed focus saves even after switching back to the original workspace', async () => {
    const a = layout('a');
    a.root = { type: 'split', orientation: 'horizontal', ratio: 0.5, children: [a.root, layout('other').root] };
    useLayoutStore.getState().setWorkspaceId('a');
    useLayoutStore.getState().setLayout(a);
    const save = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValue(save.promise);
    useLayoutStore.getState().focusPane('pane-other');
    switchTo('b');
    switchTo('a');
    const current = useLayoutStore.getState().layout;
    save.resolve(response(layout('obsolete')));
    await save.promise;
    await Promise.resolve();
    await Promise.resolve();
    expect(useLayoutStore.getState().layout).toBe(current);
    expect(current?.activePaneId).toBe('pane-other');
  });

  it('restores browser focus without mutating cached data and prioritizes explicit navigation', async () => {
    const cached = layout('b');
    useWorkspaceLayoutStore.getState().setLayout('b', cached);
    sessionStorage.setItem('pt-active-tab-pane-b', 'b-2');
    switchTo('b');
    expect(pane().activeTabId).toBe('b-2');
    expect((cached.root as IPaneNode).activeTabId).toBe('b-1');
    useLayoutStore.getState().clearLayout();
    useLayoutStore.setState({ pendingFocusTabId: 'b-1' });
    useLayoutStore.getState().setWorkspaceId('b');
    expect(pane().activeTabId).toBe('b-1');
    fetchMock.mockResolvedValue(response(layout('b')));
    await useLayoutStore.getState().fetchLayout();
    expect(useLayoutStore.getState().pendingFocusTabId).toBeNull();
  });

  it('keeps the latest user selection during revalidation and removes tabs deleted on the server', async () => {
    useWorkspaceLayoutStore.getState().setLayout('b', layout('b'));
    switchTo('b');
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const loading = useLayoutStore.getState().fetchLayout();
    useLayoutStore.getState().switchTabInPane('pane-b', 'b-2');
    pending.resolve(response(layout('b')));
    await loading;
    expect(pane().activeTabId).toBe('b-2');
    const updated = layout('b');
    (updated.root as IPaneNode).tabs.pop();
    fetchMock.mockResolvedValue(response(updated));
    await useLayoutStore.getState().fetchLayout();
    expect(pane().activeTabId).toBe('b-1');
    expect(pane().tabs).toHaveLength(1);
  });

  it('does not restore an earlier navigation target after the user selects another cached tab', async () => {
    useWorkspaceLayoutStore.getState().setLayout('b', layout('b'));
    useLayoutStore.setState({ pendingFocusTabId: 'b-2' });
    switchTo('b');
    expect(pane().activeTabId).toBe('b-2');
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const loading = useLayoutStore.getState().fetchLayout();
    useLayoutStore.getState().switchTabInPane('pane-b', 'b-1');
    pending.resolve(response(layout('b')));
    await loading;
    expect(pane().activeTabId).toBe('b-1');
    expect(useLayoutStore.getState().pendingFocusTabId).toBeNull();
  });

  it.each(['resolve', 'reject'] as const)('ignores an old request that finishes with %s after switching', async (finish) => {
    useLayoutStore.getState().setWorkspaceId('a');
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const loading = useLayoutStore.getState().fetchLayout();
    useWorkspaceLayoutStore.getState().setLayout('b', layout('b'));
    switchTo('b');
    if (finish === 'resolve') pending.resolve(response(layout('a')));
    else pending.reject(new Error('old request failed'));
    await loading;
    expect(pane().id).toBe('pane-b');
    expect(useLayoutStore.getState()).toMatchObject({ isLoading: false, error: null, retryCount: 0 });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps a later Pane selection when navigation revalidation changes the tree: %s', async (changed) => {
    const cached = layout('b');
    cached.root = { type: 'split', orientation: 'horizontal', ratio: 0.5, children: [cached.root, layout('other').root] };
    useWorkspaceLayoutStore.getState().setLayout('b', cached);
    useLayoutStore.setState({ pendingFocusTabId: 'b-2' });
    switchTo('b');
    const pending = deferred<ReturnType<typeof response>>();
    fetchMock.mockReturnValueOnce(pending.promise);
    const loading = useLayoutStore.getState().fetchLayout();
    useLayoutStore.getState().focusPane('pane-other');
    const fetched = structuredClone(cached);
    if (changed && fetched.root.type === 'split') fetched.root.ratio = 0.6;
    pending.resolve(response(fetched));
    await loading;
    expect(useLayoutStore.getState().layout?.activePaneId).toBe('pane-other');
    expect(useLayoutStore.getState().pendingFocusTabId).toBeNull();
  });

  it('only cancels navigation for a valid Pane selection, including the current Pane', () => {
    useWorkspaceLayoutStore.getState().setLayout('b', layout('b'));
    useLayoutStore.setState({ pendingFocusTabId: 'b-2' });
    switchTo('b');
    useLayoutStore.getState().focusPane('missing');
    expect(useLayoutStore.getState().pendingFocusTabId).toBe('b-2');
    expect(useLayoutStore.getState().layout?.activePaneId).toBe('pane-b');
    useLayoutStore.getState().focusPane('pane-b');
    expect(useLayoutStore.getState().pendingFocusTabId).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([undefined, { panelOpen: true, panelSize: 40, activeTab: 'history', viewMode: 'unified' } as const])(
    'revalidates diff settings without tree changes: %j', async (diffSettings) => {
      const cached = { ...layout('b'), diffSettings: { panelOpen: false, panelSize: 25, activeTab: 'changes' as const } };
      useWorkspaceLayoutStore.getState().setLayout('b', cached);
      switchTo('b');
      useLayoutStore.getState().switchTabInPane('pane-b', 'b-2');
      const fetched = { ...layout('b'), diffSettings, updatedAt: 'server-settings-update' };
      fetchMock.mockResolvedValue(response(fetched));
      await useLayoutStore.getState().fetchLayout();
      expect(useLayoutStore.getState().layout?.diffSettings).toEqual(diffSettings);
      expect(useLayoutStore.getState().layout?.updatedAt).toBe('server-settings-update');
      expect(useWorkspaceLayoutStore.getState().layouts.b.diffSettings).toEqual(diffSettings);
      expect(useLayoutStore.getState().layout?.activePaneId).toBe('pane-b');
      expect(pane().activeTabId).toBe('b-2');
    },
  );

  it('retains cached content and reports failures without fallback creation, then recovers', async () => {
    const onError = vi.fn();
    setOnFetchError(onError);
    useWorkspaceLayoutStore.getState().setLayout('b', layout('b'));
    switchTo('b');
    fetchMock.mockRejectedValue(new Error('offline'));
    for (let i = 0; i < 3; i++) await useLayoutStore.getState().fetchLayout();
    expect(pane().id).toBe('pane-b');
    expect(toast.error).toHaveBeenCalledWith('layoutFetchError');
    expect(onError).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([, options]) => !options.method)).toBe(true);
    fetchMock.mockResolvedValue(response(layout('b')));
    await useLayoutStore.getState().fetchLayout();
    expect(useLayoutStore.getState()).toMatchObject({ isLoading: false, error: null });
  });

  it('clears content when no workspace remains', () => {
    useWorkspaceLayoutStore.getState().setLayout('b', layout('b'));
    switchTo('b');
    useLayoutStore.getState().setWorkspaceId(null);
    expect(useLayoutStore.getState()).toMatchObject({ layout: null, workspaceId: null, isLoading: false, paneCount: 0 });
  });
});
