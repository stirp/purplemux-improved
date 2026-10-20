// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ show: vi.fn(), badge: vi.fn(), navigate: vi.fn() }));
vi.mock('@/hooks/use-is-electron', () => ({ default: true }));
vi.mock('@/hooks/use-layout', () => ({ navigateToTab: mocks.navigate }));

import useNativeNotification, { showQuestionNativeNotification } from '@/hooks/use-native-notification';
import useTabStore from '@/hooks/use-tab-store';
import useConfigStore from '@/hooks/use-config-store';

let onClick: (id?: string) => void;
let root: Root;
let container: HTMLDivElement;
const Harness = () => { useNativeNotification(); return null; };

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.assign(window, { electronAPI: {
    showNotification: mocks.show.mockResolvedValue(true), setDockBadge: mocks.badge.mockResolvedValue(undefined),
    onNotificationClick: (callback: (id?: string) => void) => { onClick = callback; return () => {}; },
  } });
  useConfigStore.setState({ notificationsEnabled: true });
  useTabStore.setState({ tabs: {} });
  useTabStore.getState().initTab('tab', { cliState: 'busy', workspaceId: 'ws', agentSessionId: 'session', pendingUserQuestions: [{ id: 'q', question: '确认？' }] });
  container = document.createElement('div');
  root = createRoot(container);
  await act(async () => root.render(createElement(Harness)));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe('native question notifications', () => {
  it.each(['ready-for-review', 'needs-input'] as const)('does not redirect an earlier %s notification after showing a question', async (cliState) => {
    useTabStore.getState().initTab('ordinary', { cliState: 'busy', workspaceId: 'ordinary-ws', agentSessionId: 'ordinary-session' });
    await act(async () => useTabStore.getState().initTab('ordinary', { cliState }));
    expect(mocks.show.mock.calls[0][2]).toBeUndefined();
    showQuestionNativeNotification('tab', useTabStore.getState().tabs.tab, '需要回答', '确认？', 'q');
    await act(async () => {});
    onClick();
    expect(mocks.navigate).toHaveBeenLastCalledWith('ordinary-ws', 'ordinary');
    onClick(mocks.show.mock.calls[1][2]);
    expect(mocks.navigate).toHaveBeenLastCalledWith('ws', 'tab');
  });

  it('keeps ordinary notification routing when an earlier question send resolves later', async () => {
    let resolve!: (shown: boolean) => void;
    mocks.show.mockImplementationOnce(() => new Promise<boolean>((done) => { resolve = done; }));
    showQuestionNativeNotification('tab', useTabStore.getState().tabs.tab, '需要回答', '确认？', 'q');
    useTabStore.getState().initTab('ordinary', { cliState: 'busy', workspaceId: 'ordinary-ws' });
    await act(async () => useTabStore.getState().initTab('ordinary', { cliState: 'ready-for-review' }));
    await act(async () => resolve(true));
    onClick();
    expect(mocks.navigate).toHaveBeenLastCalledWith('ordinary-ws', 'ordinary');
    onClick(mocks.show.mock.calls[0][2]);
    expect(mocks.navigate).toHaveBeenLastCalledWith('ws', 'tab');
  });

  it('obeys the existing notification setting', () => {
    useConfigStore.setState({ notificationsEnabled: false });
    showQuestionNativeNotification('tab', useTabStore.getState().tabs.tab, '需要回答', '确认？', 'q');
    expect(mocks.show).not.toHaveBeenCalled();
  });

  it('opens the notified session and rejects the target after that session changes', async () => {
    showQuestionNativeNotification('tab', useTabStore.getState().tabs.tab, '需要回答', '确认？', 'q');
    await act(async () => {});
    onClick(mocks.show.mock.calls[0][2]);
    expect(mocks.navigate).toHaveBeenCalledWith('ws', 'tab');
    mocks.navigate.mockClear();
    useTabStore.getState().initTab('tab', { agentSessionId: 'other' });
    onClick(mocks.show.mock.calls[0][2]);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('handles notification failures and counts async questions in the badge without changing busy state', async () => {
    mocks.show.mockRejectedValue(new Error('notification unavailable'));
    showQuestionNativeNotification('tab', useTabStore.getState().tabs.tab, '需要回答', '确认？', 'q');
    await act(async () => useTabStore.getState().initTab('tab', { pendingUserQuestions: [{ id: 'q', question: '确认？' }] }));
    expect(mocks.badge).toHaveBeenLastCalledWith(1);
    expect(useTabStore.getState().tabs.tab.cliState).toBe('busy');
  });

  it('routes each retained notification to its own session and ignores answered questions', async () => {
    showQuestionNativeNotification('tab', useTabStore.getState().tabs.tab, '需要回答', '确认？', 'q');
    useTabStore.getState().initTab('second', {
      cliState: 'busy', workspaceId: 'other-ws', agentSessionId: 'other-session',
      pendingUserQuestions: [{ id: 'q2', question: '第二个问题' }],
    });
    showQuestionNativeNotification('second', useTabStore.getState().tabs.second, '需要回答', '第二个问题', 'q2');
    await act(async () => {});
    onClick(mocks.show.mock.calls[0][2]);
    expect(mocks.navigate).toHaveBeenLastCalledWith('ws', 'tab');
    onClick(mocks.show.mock.calls[1][2]);
    expect(mocks.navigate).toHaveBeenLastCalledWith('other-ws', 'second');
    mocks.navigate.mockClear();
    useTabStore.getState().initTab('tab', { pendingUserQuestions: [] });
    onClick(mocks.show.mock.calls[0][2]);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
