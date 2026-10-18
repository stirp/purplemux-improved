import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ILayoutData, ITab } from '@/types/terminal';

const mocks = vi.hoisted(() => ({ initTab: vi.fn() }));
vi.mock('next/router', () => ({ default: {} }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
vi.mock('@/hooks/use-web-input', () => ({ clearInputDraft: vi.fn() }));
vi.mock('@/hooks/use-tab-store', () => ({ default: { getState: () => ({ initTab: mocks.initTab }) } }));
vi.mock('@/hooks/use-workspace-store', () => ({ default: { getState: () => ({ workspaces: [{ id: 'ws-test', directories: ['/repo/missing'] }] }) } }));
vi.mock('@/hooks/use-tab-metadata-store', () => ({ default: { getState: () => ({ metadata: {} }) } }));

import { useLayoutStore } from '@/hooks/use-layout';

beforeEach(() => {
  vi.clearAllMocks();
  const layout: ILayoutData = {
    root: { type: 'pane', id: 'pane-test', tabs: [], activeTabId: null },
    activePaneId: 'pane-test', updatedAt: '2026-10-18T00:00:00Z',
  };
  useLayoutStore.setState({ workspaceId: 'ws-test', layout });
  vi.spyOn(useLayoutStore.getState(), 'fetchLayout').mockResolvedValue();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('new tab launch state after directory fallback', () => {
  it.each(['command', 'resume'])('keeps the new tab without a pending %s when cwd changed', async (launch) => {
    const tab: ITab = { id: 'tab-new', sessionName: 'session-new', name: '', order: 0, cwd: '/repo' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => tab }));
    const created = await useLayoutStore.getState().createTabInPane('pane-test', 'codex-cli', launch === 'command' ? 'codex' : undefined, launch === 'resume' ? 'session-id' : undefined);
    expect(created).toEqual(tab);
    expect(mocks.initTab).not.toHaveBeenCalled();
    expect(useLayoutStore.getState().layout?.root).toMatchObject({ tabs: [tab], activeTabId: tab.id });
  });

  it('keeps launch checking when the requested directory is preserved', async () => {
    const tab: ITab = { id: 'tab-new', sessionName: 'session-new', name: '', order: 0, cwd: '/repo/missing' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => tab }));
    await useLayoutStore.getState().createTabInPane('pane-test', 'codex-cli', 'codex');
    expect(mocks.initTab).toHaveBeenCalledWith(tab.id, { panelType: 'codex-cli', sessionView: 'check' });
  });
});
