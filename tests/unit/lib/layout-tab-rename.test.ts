import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ILayoutData } from '@/types/terminal';

vi.mock('next/router', () => ({ default: {} }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
vi.mock('@/hooks/use-web-input', () => ({ clearInputDraft: vi.fn() }));
vi.mock('@/hooks/use-tab-store', () => ({ default: {} }));
vi.mock('@/hooks/use-workspace-store', () => ({ default: {} }));
vi.mock('@/hooks/use-tab-metadata-store', () => ({ default: {} }));

import { toast } from 'sonner';
import { useLayoutStore } from '@/hooks/use-layout';

const layout = (name: string): ILayoutData => ({
  root: {
    type: 'pane', id: 'pane-test', activeTabId: 'tab-test',
    tabs: [{ id: 'tab-test', name, order: 0, sessionName: 'session-test' }],
  },
  activePaneId: 'pane-test', updatedAt: '2026-09-27T00:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  useLayoutStore.setState({ workspaceId: 'ws-test', layout: layout('Original') });
});
afterEach(() => vi.unstubAllGlobals());

describe('tab rename persistence', () => {
  it('applies the saved name and reports success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => layout('Renamed') });
    vi.stubGlobal('fetch', fetchMock);
    expect(await useLayoutStore.getState().renameTabInPane('pane-test', 'tab-test', 'Renamed')).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/layout/pane/pane-test/tabs/tab-test?workspace=ws-test', expect.objectContaining({
      method: 'PATCH', body: JSON.stringify({ name: 'Renamed' }),
    }));
    expect(useLayoutStore.getState().layout).toEqual(layout('Renamed'));
  });

  it('keeps the saved name and reports failure when the API rejects the rename', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await useLayoutStore.getState().renameTabInPane('pane-test', 'tab-test', 'Unsaved')).toBe(false);
    expect(useLayoutStore.getState().layout).toEqual(layout('Original'));
    expect(toast.error).toHaveBeenCalledWith('tabRenameFailed');
  });

  it('does not overwrite a different workspace after a delayed response', async () => {
    let resolveResponse!: (response: unknown) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveResponse = resolve; })));
    const pending = useLayoutStore.getState().renameTabInPane('pane-test', 'tab-test', 'Renamed');
    useLayoutStore.setState({ workspaceId: 'ws-other', layout: layout('Other workspace') });
    resolveResponse({ ok: true, json: async () => layout('Renamed') });
    expect(await pending).toBe(true);
    expect(useLayoutStore.getState().layout).toEqual(layout('Other workspace'));
  });
});
