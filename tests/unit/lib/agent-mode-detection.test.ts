// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MobileTabHeader from '@/components/features/mobile/mobile-tab-header';
import AgentModeSwitcher from '@/components/features/workspace/agent-mode-switcher';
import useTabStore from '@/hooks/use-tab-store';
import useGitStatusStore from '@/hooks/use-git-status-store';
import { refreshDetectedAgent, type IAgentCheckResponse } from '@/lib/agent-check';
import type { TPanelType } from '@/types/terminal';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/components/features/workspace/copy-pane-drawer', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/tab-status-indicator', () => ({ default: () => null }));

let root: Root;
let container: HTMLDivElement;
const switchPanel = vi.fn();
const startAgent = vi.fn();
const sessionName = 'session/with space';

const response = (data: IAgentCheckResponse) => ({ ok: true, json: async () => data }) as Response;
const runningResponse = (provider = 'claude') => response({
  running: true, checkedAt: 10, sessionId: 'original-session', providerId: provider,
  providerPanelType: provider === 'claude' ? 'claude-code' : 'codex-cli',
});
const button = (label: string) => Array.from(document.querySelectorAll('button'))
  .find((element) => element.textContent === label || element.getAttribute('aria-label') === label);
const click = async (label: string) => {
  expect(button(label)).toBeDefined();
  await act(async () => button(label)!.click());
};
const render = async (panelType: TPanelType = 'terminal', desktop = false, session: string | null = sessionName) => {
  await act(async () => root.render(desktop
    ? createElement(AgentModeSwitcher, { tabId: 'tab', sessionName: session!, panelType, onSwitchPanelType: switchPanel })
    : createElement(MobileTabHeader, {
        tabId: 'tab', tabName: 'node', customTabName: '', onRename: async () => true,
        sessionName: session, cwdKey: null, panelType, onSwitchPanelType: switchPanel,
        onCreateTab: vi.fn(), onOpenGit: vi.fn(), onClose: vi.fn(),
      })));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(runningResponse()));
  vi.spyOn(useGitStatusStore.getState(), 'fetchForTarget').mockResolvedValue(undefined);
  useTabStore.setState({ tabs: {} });
  useTabStore.getState().initTab('tab', { panelType: 'terminal', currentProcess: 'node', cliState: 'inactive' });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  window.addEventListener('purplemux-start-agent', startAgent);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  container.remove();
  window.removeEventListener('purplemux-start-agent', startAgent);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('view mode live agent detection', () => {
  it.each([false, true])('keeps Chat available when newer activity supersedes a cached exit (desktop: %s)', async (desktop) => {
    useTabStore.getState().setDetectedAgent('tab', { running: false, checkedAt: 10 });
    useTabStore.getState().updateFromServer('tab', {
      workspaceId: 'ws', panelType: 'terminal', agentProviderId: 'codex', agentSessionId: 'root',
      cliState: 'busy', lastEvent: { name: 'prompt-submit', at: 20, seq: 2 }, eventSeq: 2,
    });
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    await render('terminal', desktop);
    await click('Select tab mode');
    expect(button('Chat')).toBeDefined();
    expect(button('Start Claude')).toBeUndefined();
  });

  it.each([false, true])('returns from Codex through Terminal to its original chat (desktop: %s)', async (desktop) => {
    vi.mocked(fetch).mockResolvedValue(runningResponse('codex'));
    useTabStore.getState().setPanelType('tab', 'codex-cli');
    await render('codex-cli', desktop);
    await click('Select tab mode');
    await click('Terminal');
    expect(switchPanel).toHaveBeenLastCalledWith('terminal');
    await act(async () => {
      useTabStore.getState().setPanelType('tab', 'terminal');
      useTabStore.getState().updateFromServer('tab', {
        workspaceId: 'ws-test', cliState: 'busy', panelType: 'terminal', currentProcess: 'node', agentSessionId: null,
      });
    });
    await render('terminal', desktop);
    await click('Select tab mode');
    expect(button('Start Claude')).toBeUndefined();
    expect(button('Start Codex')).toBeUndefined();
    await click('Chat');
    expect(switchPanel).toHaveBeenLastCalledWith('codex-cli');
    expect(startAgent).not.toHaveBeenCalled();
    expect(useTabStore.getState().tabs.tab).toMatchObject({ agentProviderId: 'codex', agentSessionId: 'original-session' });
  });

  it('returns from Claude through Terminal to the same chat when tmux reports node', async () => {
    useTabStore.getState().setPanelType('tab', 'claude-code');
    await render('claude-code');
    await click('Select tab mode');
    await click('Terminal');
    expect(switchPanel).toHaveBeenLastCalledWith('terminal');
    await act(async () => {
      useTabStore.getState().setPanelType('tab', 'terminal');
      useTabStore.getState().updateFromServer('tab', {
        workspaceId: 'ws-test', cliState: 'idle', panelType: 'terminal', currentProcess: 'node', agentSessionId: null,
      });
    });
    await render();
    await click('Select tab mode');
    expect(fetch).toHaveBeenCalledWith('/api/check-agent?session=session%2Fwith%20space', { signal: expect.any(AbortSignal) });
    expect(button('Chat')).toBeDefined();
    expect(button('Start Claude')).toBeUndefined();
    await click('Chat');
    expect(switchPanel).toHaveBeenLastCalledWith('claude-code');
    expect(startAgent).not.toHaveBeenCalled();
    expect(useTabStore.getState().tabs.tab.agentSessionId).toBe('original-session');
  });

  it.each(['claude', 'codex'])('recovers %s after reload without cached provider identity', async (provider) => {
    vi.mocked(fetch).mockResolvedValue(runningResponse(provider));
    await render();
    await click('Select tab mode');
    await click('Chat');
    expect(switchPanel).toHaveBeenCalledWith(provider === 'claude' ? 'claude-code' : 'codex-cli');
    expect(startAgent).not.toHaveBeenCalled();
  });

  it('allows returning to a running Claude that has not written a session ID', async () => {
    vi.mocked(fetch).mockResolvedValue(response({ running: true, checkedAt: 10, providerId: 'claude', providerPanelType: 'claude-code', sessionId: null }));
    await render();
    await click('Select tab mode');
    await click('Chat');
    expect(switchPanel).toHaveBeenCalledWith('claude-code');
    expect(startAgent).not.toHaveBeenCalled();
  });

  it('shows start actions after a confirmed exit even while the foreground command is node', async () => {
    useTabStore.getState().setDetectedAgent('tab', { running: true, checkedAt: 1, providerId: 'claude', sessionId: 'original-session' });
    vi.mocked(fetch).mockResolvedValue(response({ running: false, checkedAt: 10 }));
    await render();
    await click('Select tab mode');
    expect(button('Chat')).toBeUndefined();
    expect(button('Start Claude')).toBeDefined();
    expect(button('Start Codex')).toBeDefined();
    expect(useTabStore.getState().tabs.tab.agentProviderId).toBe('claude');
    expect(useTabStore.getState().tabs.tab.agentSessionId).toBe('original-session');
  });

  it.each(['network', 'http'])('opens with the last detected identity on %s failure', async (failure) => {
    useTabStore.getState().setDetectedAgent('tab', { running: true, checkedAt: 1, providerId: 'claude' });
    if (failure === 'network') vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    else vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    await render();
    await click('Select tab mode');
    expect(button('Chat')).toBeDefined();
    expect(useTabStore.getState().tabs.tab.agentProcessCheckedAt).toBe(1);
  });

  it('opens without a request when the tmux session is missing', async () => {
    await render('terminal', false, null);
    await click('Select tab mode');
    expect(fetch).not.toHaveBeenCalled();
    expect(button('Start Claude')).toBeDefined();
  });

  it('keeps the desktop menu live check and chat switch behavior', async () => {
    await render('terminal', true);
    await click('Select tab mode');
    await click('Chat');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(switchPanel).toHaveBeenCalledWith('claude-code');
    expect(startAgent).not.toHaveBeenCalled();
  });

  it('does not let an older menu response overwrite a newer process detection', async () => {
    useTabStore.getState().setDetectedAgent('tab', { running: false, checkedAt: 20 });
    await refreshDetectedAgent('tab', sessionName);
    expect(useTabStore.getState().tabs.tab).toMatchObject({ agentProcess: false, agentProcessCheckedAt: 20 });
  });

  it.each([
    [false, 'request'], [false, 'body'], [true, 'request'], [true, 'body'],
  ] as const)('bounds a stalled %s desktop / %s check and ignores its late exit response', async (desktop, stage) => {
    useTabStore.getState().setDetectedAgent('tab', { running: true, checkedAt: 1, providerId: 'claude' });
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    // Deliberately ignore abort to verify that the deadline also guards late responses.
    vi.mocked(fetch).mockImplementation(async () => {
      if (stage === 'request') await gate;
      return {
        ok: true,
        json: async () => {
          if (stage === 'body') await gate;
          return { running: false, checkedAt: 10 };
        },
      } as Response;
    });
    await render('terminal', desktop);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await click('Select tab mode');
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    await act(async () => { await vi.advanceTimersByTimeAsync(2_999); });
    expect(button('Chat')).toBeUndefined();
    expect(signal?.aborted).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(signal?.aborted).toBe(true);
    expect(button('Chat')).toBeDefined();
    await click('Chat');
    expect(switchPanel).toHaveBeenCalledWith('claude-code');
    expect(startAgent).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(useTabStore.getState().tabs.tab).toMatchObject({
      agentProcess: true, agentProviderId: 'claude', agentProcessCheckedAt: 1,
    });
  });

  it.each(['success', 'network', 'http', 'body'])('cleans the deadline timer after %s completion', async (outcome) => {
    vi.useFakeTimers();
    if (outcome === 'network') vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    if (outcome === 'http') vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
    if (outcome === 'body') vi.mocked(fetch).mockResolvedValue({
      ok: true, json: async () => { throw new Error('invalid JSON'); },
    } as unknown as Response);
    await refreshDetectedAgent('tab', sessionName);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(false);
  });
});
