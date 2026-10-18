// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/hooks/use-git-branch', () => ({ default: () => ({ branch: 'main', isLoading: false }) }));
vi.mock('@/hooks/use-git-status', () => ({ default: () => ({ status: null }) }));
vi.mock('@/hooks/use-tmux-info', () => ({ default: () => null }));
vi.mock('@/hooks/use-message-counts', () => ({ default: () => null }));

import { toast } from 'sonner';
import SessionMetaBar from '@/components/features/workspace/session-meta-bar';
import SessionMetaHeader from '@/components/features/workspace/session-meta-header';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabStore from '@/hooks/use-tab-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { reconcileSessionWorkflow, WORK_STATUSES } from '@/lib/session-workflow';
import type { ISessionMetaData } from '@/hooks/use-session-meta';
import type { TSessionHistoryProvider } from '@/types/session-history';

const meta: ISessionMetaData = {
  title: 'Current chat', createdAt: null, updatedAt: null, fileSize: 0, userCount: 0, assistantCount: 0,
  inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningOutputTokens: null,
  totalCost: null, currentContextTokens: null, contextWindowSize: null, usedPercentage: null, model: null, exceeds200k: false,
};
const initialWorkspace = useWorkspaceStore.getState();
const initialTabs = useTabStore.getState();
const initialHistory = useSessionHistoryStore.getState();
const fetchMock = vi.fn();
let root: Root;
let container: HTMLDivElement;

const render = async (provider: TSessionHistoryProvider = 'claude', sessionId: string | null = 'A', statusDisabled = false) => {
  await act(async () => root.render(createElement(SessionMetaBar, {
    meta, provider, tabId: 'tab', sessionName: 'test-session', sessionId, jsonlPath: null, statusDisabled,
  })));
};
const trigger = () => container.querySelector('[role="combobox"]') as HTMLButtonElement;
const details = () => container.querySelector('[role="button"][aria-expanded]') as HTMLElement;
const open = async () => {
  await act(async () => trigger().click());
};
const choose = async (label: string) => {
  await open();
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent === label);
  expect(option).toBeDefined();
  await act(async () => option!.focus());
  await act(async () => option!.click());
};

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init: RequestInit) => {
    const { key, status } = JSON.parse(init.body as string);
    const workflow = useWorkspaceStore.getState().sessionWorkflow;
    const statuses = { ...workflow.statuses };
    if (status === null) delete statuses[key];
    else statuses[key] = status;
    return { ok: true, json: async () => ({ ...workflow, statuses }) };
  });
  useWorkspaceStore.setState({ sessionWorkflow: { statuses: {}, collapsed: {} }, syncWorkspaces: vi.fn(async () => {}) });
  useTabStore.setState({ tabs: {} });
  useTabStore.getState().initTab('tab', {
    workspaceId: 'ws', panelType: 'claude-code', agentProviderId: 'claude', agentSessionId: 'A', cliState: 'ready-for-review',
  });
  useSessionHistoryStore.setState({ entries: [] });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  useWorkspaceStore.setState(initialWorkspace);
  useTabStore.setState(initialTabs);
  useSessionHistoryStore.setState(initialHistory);
  vi.unstubAllGlobals();
});

describe('Chat work status in the real metadata bar', () => {
  it.each(['claude', 'codex'] as const)('saves all stages and restores automatic for %s without opening details', async (provider) => {
    useTabStore.getState().initTab('tab', { agentProviderId: provider, panelType: provider === 'codex' ? 'codex-cli' : 'claude-code' });
    await render(provider);
    expect(trigger().textContent).toContain('workStatus_review');
    for (const status of WORK_STATUSES) {
      await choose('workStatus_' + status);
      expect(fetchMock).toHaveBeenLastCalledWith('/api/session-workflow', expect.objectContaining({
        method: 'PATCH', body: JSON.stringify({ key: `${provider}:A`, status }),
      }));
      expect(trigger().textContent).toContain('workStatus_' + status);
      expect(details().getAttribute('aria-expanded')).toBe('false');
    }
    await choose('workStatusAuto');
    expect(useWorkspaceStore.getState().sessionWorkflow.statuses[`${provider}:A`]).toBeUndefined();
    expect(trigger().textContent).toContain('workStatus_review');
    expect(useWorkspaceStore.getState().syncWorkspaces).toHaveBeenCalledTimes(5);
  });

  it('keeps the old value and disables repeated edits while saving, then reports failure', async () => {
    let finish!: (response: { ok: boolean }) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render();
    await choose('workStatus_completed');
    expect(trigger().getAttribute('aria-readonly')).toBe('true');
    expect(trigger().textContent).toContain('workStatus_review');
    await open();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: false }));
    expect(trigger().disabled).toBe(false);
    expect(trigger().hasAttribute('aria-readonly')).toBe(false);
    expect(trigger().textContent).toContain('workStatus_review');
    expect(toast.error).toHaveBeenCalledWith('workStatusSaveFailed');
  });

  it('reacts to shared workflow updates and keeps manual completion during model execution', async () => {
    await render();
    await act(async () => {
      useWorkspaceStore.setState({ sessionWorkflow: { statuses: { 'claude:A': 'completed' }, collapsed: {} } });
      useTabStore.setState((state) => ({ tabs: { ...state.tabs, tab: { ...state.tabs.tab, cliState: 'busy' } } }));
    });
    expect(trigger().textContent).toContain('workStatus_completed');
    await choose('workStatusAuto');
    expect(trigger().textContent).toContain('workStatus_in-progress');
    expect(useTabStore.getState().tabs.tab.cliState).toBe('busy');
  });

  it.each([true, false])('preserves the trigger and keyboard focus across a delayed save (ok=%s)', async (ok) => {
    let finish!: (response: { ok: boolean; json: () => Promise<unknown> }) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render();
    const button = trigger();
    await act(async () => button.focus());
    await choose('workStatus_completed');
    expect(trigger()).toBe(button);
    await vi.waitFor(() => expect(document.activeElement).toBe(button));
    await open();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok, json: async () => ({ statuses: { 'claude:A': 'completed' }, collapsed: {} }) }));
    expect(trigger()).toBe(button);
    expect(document.activeElement).toBe(button);
    await act(async () => button.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it.each([false, true])('does not steal focus after a delayed save when the user moves away (session changed=%s)', async (changeSession) => {
    let finish!: (response: { ok: boolean }) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await render();
    await choose('workStatus_completed');
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger()));
    if (changeSession) {
      await act(async () => useTabStore.getState().initTab('tab', { agentSessionId: 'B' }));
      await render('claude', 'B');
    }
    const otherControl = details();
    await act(async () => otherControl.focus());
    await act(async () => finish({ ok: false }));
    expect(document.activeElement).toBe(otherControl);
    expect(trigger().disabled).toBe(false);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('saves fallback identity then follows its first migration without inheriting it in another session', async () => {
    useTabStore.setState((state) => ({ tabs: { ...state.tabs, tab: { ...state.tabs.tab, agentSessionId: null, cliState: 'idle' } } }));
    await render('claude', null);
    await choose('workStatus_completed');
    expect(useWorkspaceStore.getState().sessionWorkflow.statuses['claude:tab:tab']).toBe('completed');
    await act(async () => useTabStore.getState().initTab('tab', { agentSessionId: 'A' }));
    await render();
    expect(trigger().disabled).toBe(true);
    await act(async () => useWorkspaceStore.setState({ sessionWorkflow: reconcileSessionWorkflow(
      useWorkspaceStore.getState().sessionWorkflow, [], useTabStore.getState().tabs,
    ) }));
    expect(trigger().disabled).toBe(false);
    expect(trigger().textContent).toContain('workStatus_completed');
    await act(async () => useTabStore.getState().initTab('tab', { agentSessionId: 'B' }));
    await render('claude', 'B');
    expect(trigger().textContent).toContain('workStatus_pending');
    await choose('workStatus_in-progress');
    expect(useWorkspaceStore.getState().sessionWorkflow.statuses['claude:A']).toBe('completed');
    expect(useWorkspaceStore.getState().sessionWorkflow.statuses['claude:B']).toBe('in-progress');
  });

  it('closes the old menu when the live identity changes and blocks stale cached metadata', async () => {
    await render();
    await open();
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    await act(async () => useTabStore.getState().initTab('tab', { agentSessionId: 'B' }));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(trigger().disabled).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    await render('claude', 'B');
    expect(trigger().disabled).toBe(false);
  });

  it.each(['loading/disconnected', 'deleted', 'provider mismatch', 'missing tab'])('blocks edits for %s', async (reason) => {
    if (reason === 'deleted') useWorkspaceStore.setState({ sessionWorkflow: { statuses: {}, collapsed: {}, deleted: ['claude:A'] } });
    if (reason === 'provider mismatch') useTabStore.getState().initTab('tab', { agentProviderId: 'codex', panelType: 'codex-cli' });
    if (reason === 'missing tab') useTabStore.getState().removeTab('tab');
    await render('claude', 'A', reason === 'loading/disconnected');
    expect(trigger().disabled).toBe(true);
    await open();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('supports keyboard menu opening and Escape while keeping detail expansion separate', async () => {
    await render();
    await act(async () => {
      trigger().focus();
      trigger().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    expect(details().getAttribute('aria-expanded')).toBe('false');
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    await act(async () => details().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(details().getAttribute('aria-expanded')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the mobile detail-sheet callback separate from status changes', async () => {
    const onExpand = vi.fn();
    await act(async () => root.render(createElement(SessionMetaHeader, {
      meta, provider: 'claude', tabId: 'tab', sessionId: 'A', branch: null, expanded: false, onExpand,
    })));
    await choose('workStatus_completed');
    expect(onExpand).not.toHaveBeenCalled();
    await act(async () => details().click());
    expect(onExpand).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps mobile metadata readable but disables status when the optional tab ID is absent', async () => {
    await act(async () => root.render(createElement(SessionMetaHeader, {
      meta, provider: 'claude', sessionId: 'A', branch: null, expanded: false, onExpand: vi.fn(),
    })));
    expect(container.textContent).toContain(meta.title);
    expect(trigger().disabled).toBe(true);
    await open();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
