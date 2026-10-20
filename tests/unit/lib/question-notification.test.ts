// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ warning: vi.fn(), dismiss: vi.fn(), navigate: vi.fn(), native: vi.fn() }));
vi.mock('sonner', () => ({ toast: { warning: mocks.warning, dismiss: mocks.dismiss } }));
vi.mock('@/hooks/use-layout', () => ({ navigateToTab: mocks.navigate }));
vi.mock('@/hooks/use-native-notification', () => ({ showQuestionNativeNotification: mocks.native }));
vi.mock('@/lib/i18n', () => ({ t: (_ns: string, key: string) => key }));

import useQuestionNotification from '@/hooks/use-question-notification';
import useTabStore from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useConfigStore from '@/hooks/use-config-store';

const Harness = () => { useQuestionNotification(); return null; };
let root: Root;
let container: HTMLDivElement;
const pending = [{ id: 'q1', question: '选择方案？' }];
const update = (questions = pending, session = 'session') => {
  useTabStore.getState().updateFromServer('tab', {
    cliState: 'busy', workspaceId: 'ws', agentProviderId: 'codex', agentSessionId: session,
    pendingUserQuestions: questions,
  });
};

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useTabStore.setState({ tabs: {} });
  useWorkspaceStore.setState({ workspaces: [{ id: 'ws', name: 'Project', directories: [] }] });
  useConfigStore.setState({ toastOnCompleteEnabled: false });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
});

afterEach(async () => {
  await act(async () => useTabStore.setState({ tabs: {} }));
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('global question notifications', () => {
  it('rejects a stale toast after the tab moves to another workspace with the same session and question', async () => {
    await act(async () => update());
    const options = mocks.warning.mock.calls[0][1];
    await act(async () => useTabStore.getState().setWorkspaceId('tab', 'other-workspace'));
    options.action.onClick();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.dismiss).toHaveBeenCalledWith(options.id);
  });

  it('notifies without a mounted timeline even when completion toasts are disabled or the page is hidden', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await act(async () => update());
    expect(mocks.warning).toHaveBeenCalledWith('questionRequiredTitle · Project', expect.objectContaining({
      description: '选择方案？', duration: Infinity, closeButton: true,
    }));
    const options = mocks.warning.mock.calls[0][1];
    options.action.onClick();
    expect(mocks.navigate).toHaveBeenCalledWith('ws', 'tab');
    expect(mocks.dismiss).toHaveBeenCalledWith(options.id);
    expect(useTabStore.getState().tabs.tab.cliState).toBe('busy');
    vi.restoreAllMocks();
  });

  it('deduplicates repeated syncs, reconnects and hook remounts but not new calls', async () => {
    await act(async () => update());
    await act(async () => update());
    await act(async () => useTabStore.getState().syncAllFromServer({ tab: { ...useTabStore.getState().tabs.tab } }));
    await act(async () => root.render(null));
    await act(async () => root.render(createElement(Harness)));
    expect(mocks.warning).toHaveBeenCalledTimes(1);
    await act(async () => update([{ id: 'q2', question: '选择方案？' }]));
    expect(mocks.warning).toHaveBeenCalledTimes(2);
  });

  it('dismisses resolved questions, ignores stale actions and notifies the same ID in a new session', async () => {
    await act(async () => update());
    const options = mocks.warning.mock.calls[0][1];
    await act(async () => update([]));
    expect(mocks.dismiss).toHaveBeenCalledWith(options.id);
    options.action.onClick();
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => update(pending, 'new-session'));
    expect(mocks.warning).toHaveBeenCalledTimes(2);
    options.action.onClick();
    expect(mocks.navigate).not.toHaveBeenCalled();
    const newId = mocks.warning.mock.calls[1][1].id;
    await act(async () => useTabStore.getState().removeTab('tab'));
    expect(mocks.dismiss).toHaveBeenCalledWith(newId);
  });

  it('ignores old-server updates without question metadata and stale updates cannot revive resolved questions', async () => {
    await act(async () => useTabStore.getState().updateFromServer('tab', { cliState: 'busy', workspaceId: 'ws' }));
    expect(mocks.warning).not.toHaveBeenCalled();
    await act(async () => update());
    await act(async () => useTabStore.getState().updateFromServer('tab', {
      ...useTabStore.getState().tabs.tab, pendingUserQuestions: [], eventSeq: 3,
    }));
    await act(async () => useTabStore.getState().updateFromServer('tab', {
      ...useTabStore.getState().tabs.tab, pendingUserQuestions: pending, eventSeq: 2,
    }));
    expect(useTabStore.getState().tabs.tab.pendingUserQuestions).toEqual([]);
    expect(mocks.warning).toHaveBeenCalledTimes(1);
  });

  it('clears a notification when reconnect sync no longer contains the tab', async () => {
    await act(async () => update());
    const id = mocks.warning.mock.calls[0][1].id;
    await act(async () => useTabStore.getState().syncAllFromServer({}));
    expect(mocks.dismiss).toHaveBeenCalledWith(id);
  });
});
