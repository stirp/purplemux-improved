// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useTabStore from '@/hooks/use-tab-store';
import useCodexBootCheck from '@/hooks/use-codex-boot-check';
import CodexBootProgress from '@/components/features/workspace/codex-boot-progress';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();
const restart = vi.fn();
const Harness = ({ tabId = 'tab-1', sessionName = 'session-1' }) => {
  const hasFailed = useCodexBootCheck(tabId, sessionName);
  const view = useTabStore((s) => s.tabs[tabId]?.sessionView);
  return view === 'check'
    ? createElement(CodexBootProgress, { hasFailed, onRestart: restart })
    : createElement('div', null, view);
};
const reply = (data: unknown) => ({ ok: true, json: async () => data });
const render = async (props = {}) => {
  await act(async () => root.render(createElement(Harness, props)));
};
const advance = async (ms: number) => {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
};
const initTab = (id = 'tab-1') => useTabStore.getState().initTab(id, {
  sessionView: 'check', panelType: 'codex-cli', agentSessionId: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T00:00:00Z'));
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockImplementation(async () => reply({ running: false, checkedAt: Date.now() }));
  restart.mockReset();
  useTabStore.setState({ tabs: {}, statusWsConnected: false });
  initTab();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Codex Chat startup checks', () => {
  it.each([false, true])('allows opening the terminal while hasFailed=%s', async (hasFailed) => {
    const onShowTerminal = vi.fn();
    await act(async () => root.render(createElement(CodexBootProgress, { hasFailed, onShowTerminal })));
    const button = Array.from(container.querySelectorAll('button')).find((node) => node.textContent?.includes('codexBootShowTerminal'));
    expect(button).toBeDefined();
    await act(async () => button!.click());
    expect(onShowTerminal).toHaveBeenCalledOnce();
    expect(restart).not.toHaveBeenCalled();
  });

  it('does not report failure at ten seconds; requires a fresh negative check after sixty seconds', async () => {
    await render();
    await advance(10_000);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await advance(49_999);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await advance(1);
    expect(container.textContent).toContain('codexBootFailed');
    expect(restart).not.toHaveBeenCalled();
  });

  it.each(['idle', 'busy', 'needs-input', 'ready-for-review'] as const)(
    'opens Chat for %s without a session ID or a process-check response', async (cliState) => {
      useTabStore.getState().initTab('tab-1', { cliState });
      await render();
      expect(container.textContent).toBe('timeline');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(useTabStore.getState().tabs['tab-1'].agentSessionId).toBeNull();
    },
  );

  it('opens Chat for an already detected process', async () => {
    useTabStore.getState().initTab('tab-1', { agentProcess: true });
    await render();
    expect(container.textContent).toBe('timeline');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recovers from the failure screen when Codex is detected without a transcript', async () => {
    await render();
    await advance(60_000);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    fetchMock.mockResolvedValue(reply({ running: true, providerPanelType: 'codex-cli', sessionId: null }));
    await advance(800);
    expect(container.textContent).toBe('timeline');
    expect(useTabStore.getState().tabs['tab-1'].agentProcess).toBe(true);
    expect(restart).not.toHaveBeenCalled();
  });

  it.each(['http', 'network', 'invalid', 'other-provider', 'body-error'])(
    'does not treat %s as a failed launch', async (kind) => {
      fetchMock.mockImplementation(async () => {
        if (kind === 'network') throw new Error('offline');
        if (kind === 'http') return { ok: false };
        if (kind === 'invalid') return reply(null);
        if (kind === 'body-error') return { ok: true, json: async () => { throw new Error('bad JSON'); } };
        return reply({ running: true, providerPanelType: 'claude-code' });
      });
      await render();
      await advance(65_000);
      expect(container.querySelector('[role="alert"]')).toBeNull();
      expect(useTabStore.getState().tabs['tab-1'].sessionView).toBe('check');
    },
  );

  it.each(['headers', 'body'])('bounds stalled %s without overlapping checks or a false error', async (stage) => {
    fetchMock.mockImplementation(() => stage === 'headers'
      ? new Promise(() => {})
      : Promise.resolve({ ok: true, json: () => new Promise(() => {}) }));
    await render();
    await advance(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(801);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    await advance(60_000);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not turn a negative request started before the deadline into failure', async () => {
    await render();
    await advance(59_000);
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await advance(200);
    await advance(1_000);
    await act(async () => resolve(reply({ running: false })));
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('ignores old responses after a new process detection', async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await render();
    await act(async () => useTabStore.getState().setAgentProcess('tab-1', true, Date.now() + 1));
    await act(async () => resolve(reply({ running: false })));
    expect(container.textContent).toBe('timeline');
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('ignores detections older than the store timestamp', async () => {
    useTabStore.getState().initTab('tab-1', { agentProcessCheckedAt: Date.now() + 1 });
    fetchMock.mockResolvedValue(reply({ running: true, providerPanelType: 'codex-cli', checkedAt: Date.now() }));
    await render();
    expect(useTabStore.getState().tabs['tab-1'].sessionView).toBe('check');
  });

  it('drops an old session response when the same tab switches sessions', async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await render();
    const signal = fetchMock.mock.calls[0][1].signal;
    await render({ sessionName: 'session-2' });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(reply({ running: true, providerPanelType: 'codex-cli' })));
    expect(useTabStore.getState().tabs['tab-1'].sessionView).toBe('check');
    await advance(59_999);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('clears an earlier failure when the next check cannot establish process state', async () => {
    await render();
    await advance(60_000);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    fetchMock.mockRejectedValue(new Error('offline'));
    await advance(800);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('clears the failure on a different tab and gives it its own startup grace', async () => {
    await render();
    await advance(60_000);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    await act(async () => initTab('tab-2'));
    await render({ tabId: 'tab-2', sessionName: 'session-2' });
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await advance(59_999);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('aborts pending checks and clears timers on unmount, ignoring late responses', async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    await render();
    const signal = fetchMock.mock.calls[0][1].signal;
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => resolve(reply({ running: true, providerPanelType: 'codex-cli' })));
    expect(useTabStore.getState().tabs['tab-1'].sessionView).toBe('check');
    root = createRoot(container);
  });
});
