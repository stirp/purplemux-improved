// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ config: vi.fn(async () => {}) }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
vi.mock('@/hooks/use-config-store', () => ({ default: { getState: () => ({ syncConfig: mocks.config }) } }));
vi.mock('@/hooks/use-layout', () => ({ useLayoutStore: { getState: () => ({}) }, collectPanes: vi.fn() }));
vi.mock('@/hooks/use-tab-store', () => ({ default: {} }));
vi.mock('@/hooks/use-workspace-layout-store', () => ({ default: {} }));
import useSync from '@/hooks/use-sync';
import useWorkspaceStore from '@/hooks/use-workspace-store';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('pulls work status and collapsed preferences on initial connect and reconnect without a visibility change', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const initialWorkspace = useWorkspaceStore.getState();
  const data = (collapsed: boolean) => ({
    workspaces: [{ id: 'ws', name: 'Work', directories: [] }], groups: [],
    sessionWorkflow: { statuses: { 'codex:s1': collapsed ? 'completed' : 'review' }, collapsed: { review: collapsed },
      tags: [{ id: 'resident', name: collapsed ? 'Updated assistant' : 'Assistant', color: 'purple' }],
      sessionTags: { 'codex:s1': collapsed ? ['resident'] : [] }, tagsRevision: collapsed ? 2 : 1,
    },
  });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => data(false) })
    .mockResolvedValueOnce({ ok: true, json: async () => data(true) });
  vi.stubGlobal('fetch', fetchMock);
  const sockets: Array<{ onopen?: () => void; onclose?: () => void; close: () => void }> = [];
  vi.stubGlobal('WebSocket', class {
    constructor() { const socket = { close: vi.fn() }; sockets.push(socket); return socket; }
  });
  const container = document.createElement('div');
  const root = createRoot(container);
  const Harness = () => { useSync(); return null; };
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => sockets[0].onopen?.());
    expect(useWorkspaceStore.getState().sessionWorkflow).toEqual(data(false).sessionWorkflow);
    await act(async () => {
      sockets[0].onclose?.();
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(sockets).toHaveLength(2);
    await act(async () => sockets[1].onopen?.());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useWorkspaceStore.getState().sessionWorkflow).toEqual(data(true).sessionWorkflow);
    expect(mocks.config).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    useWorkspaceStore.setState(initialWorkspace);
  }
});
