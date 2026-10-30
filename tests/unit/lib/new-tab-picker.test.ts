// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), install: vi.fn(async () => true), close: vi.fn(), create: vi.fn(async () => true),
  focus: vi.fn(() => true), fetchLayout: vi.fn(), refresh: vi.fn(),
  hasError: false, isLoading: false,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/hooks/use-layout', () => ({
  navigateToTabOrCreate: mocks.navigate,
  useLayoutStore: Object.assign((select: (state: unknown) => unknown) => select({ workspaceId: 'ws' }), {
    getState: () => ({ workspaceId: 'ws', focusTab: mocks.focus, fetchLayout: mocks.fetchLayout }),
  }),
}));
vi.mock('@/hooks/use-agent-install-check', () => ({
  useAgentInstallCheck: () => ({ ensureAgentInstalled: mocks.install, installDialogs: null }),
}));
vi.mock('@/hooks/use-config-store', () => ({ default: { getState: () => ({ dangerouslySkipPermissions: false }) } }));
vi.mock('@/lib/providers/codex/client', () => ({ fetchCodexLaunchCommand: async () => 'codex-launch' }));
vi.mock('@/hooks/use-new-tab-sessions', () => ({ default: () => ({
  sessions: [{ key: 'codex:s1', title: 'Retained task', updatedAt: 1,
    target: { workspaceId: 'ws', workspaceName: 'Project', workspaceDir: '/retained',
      tabId: 'old-tab', providerId: 'codex', agentSessionId: 's1' } }],
  isLoading: mocks.isLoading, isValidating: false, hasError: mocks.hasError, refresh: mocks.refresh,
}) }));
import NewTabPicker from '@/components/features/workspace/new-tab-picker';
import MobileNewTabDialog from '@/components/features/mobile/mobile-new-tab-dialog';
import useNewTabActionStore from '@/hooks/use-new-tab-action-store';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  useNewTabActionStore.setState({ pending: {} });
  mocks.hasError = false;
  mocks.isLoading = false;
  mocks.create.mockResolvedValue(true);
  mocks.install.mockResolvedValue(true);
  mocks.focus.mockReturnValue(true);
  mocks.navigate.mockImplementation(async (...args: unknown[]) => {
    (args[6] as { onNavigate: (ws: string, tab: string) => void }).onNavigate('ws', 'resumed');
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});
const render = async (mobile = false) => act(async () => root.render(createElement(NewTabPicker, {
  paneId: 'origin-pane', mobile, onClose: mocks.close, onCreateTab: mocks.create,
})));
const click = async (label: string) => {
  const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === label || item.textContent === label)!;
  await act(async () => button.click());
};
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

describe('new tab picker', () => {
  it.each([false, true])('shows applications and sessions immediately, mobile=%s', async (mobile) => {
    await render(mobile);
    expect(container.textContent).toContain('Retained task');
    expect(container.textContent).not.toContain('sessionList');
    expect(container.textContent?.includes('Web Browser')).toBe(!mobile);
    expect(mocks.create).not.toHaveBeenCalled();
    await click('codex: Retained task');
    expect(mocks.navigate).toHaveBeenCalledWith('ws', 'old-tab', 's1', 'Project', '/retained', 'codex', {
      paneId: 'origin-pane', onNavigate: expect.any(Function),
    });
    expect(mocks.focus).toHaveBeenCalledWith('resumed');
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('does not close after a resume failure and allows retry', async () => {
    mocks.navigate.mockResolvedValueOnce(undefined);
    await render();
    await click('codex: Retained task');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('resumeFailed');
    expect(mocks.close).not.toHaveBeenCalled();
    await click('codex: Retained task');
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each([false, true])('prevents another restore after unmount/reopen until completion, mobile=%s', async (mobile) => {
    const operation = deferred();
    mocks.navigate.mockImplementationOnce(async (...args: unknown[]) => {
      await operation.promise;
      (args[6] as { onNavigate: (ws: string, tab: string) => void }).onNavigate('ws', 'resumed');
    });
    await render(mobile);
    await click('codex: Retained task');
    await act(async () => root.render(null));
    await render(mobile);
    expect(container.querySelector<HTMLButtonElement>('[aria-label="codex: Retained task"]')?.disabled).toBe(true);
    await click('codex: Retained task');
    expect(mocks.navigate).toHaveBeenCalledOnce();
    await act(async () => operation.resolve());
    expect(mocks.focus).toHaveBeenCalledOnce();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('[aria-label="codex: Retained task"]')?.disabled).toBe(false);
  });

  it.each([false, true])('releases a failed restore after unmount/reopen and permits retry, mobile=%s', async (mobile) => {
    const operation = deferred();
    mocks.navigate.mockImplementationOnce(() => operation.promise);
    await render(mobile);
    await click('codex: Retained task');
    await act(async () => root.render(null));
    await render(mobile);
    await click('codex: Retained task');
    expect(mocks.navigate).toHaveBeenCalledOnce();
    await act(async () => operation.reject(new Error('network failed')));
    expect(mocks.close).not.toHaveBeenCalled();
    await click('codex: Retained task');
    expect(mocks.navigate).toHaveBeenCalledTimes(2);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('guards simultaneous clicks from separate panes before either can rerender', async () => {
    const operation = deferred();
    mocks.install.mockImplementationOnce(async () => { await operation.promise; return true; });
    await act(async () => root.render(createElement('div', null, ...['first', 'second'].map((paneId) =>
      createElement(NewTabPicker, { key: paneId, paneId, onClose: mocks.close, onCreateTab: mocks.create })))));
    const buttons = container.querySelectorAll<HTMLButtonElement>('[aria-label="codex: Retained task"]');
    await act(async () => {
      buttons[0].click();
      buttons[1].click();
    });
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(mocks.navigate).not.toHaveBeenCalled();
    await act(async () => operation.resolve());
    expect(mocks.navigate).toHaveBeenCalledOnce();
  });

  it('releases the guard when the installation check prevents a restore', async () => {
    mocks.install.mockResolvedValueOnce(false);
    await render();
    await click('codex: Retained task');
    expect(mocks.navigate).not.toHaveBeenCalled();
    await click('codex: Retained task');
    expect(mocks.navigate).toHaveBeenCalledOnce();
  });

  it('also guards application creation across close/reopen', async () => {
    const operation = deferred();
    mocks.create.mockImplementationOnce(async () => { await operation.promise; return true; });
    await render();
    await click('codexNewConversation');
    await act(async () => root.render(null));
    await render();
    await click('codexNewConversation');
    expect(mocks.create).toHaveBeenCalledOnce();
    await act(async () => operation.resolve());
    expect(mocks.close).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLButtonElement>('[aria-label="codexNewConversation"]')?.disabled).toBe(false);
  });

  it('keeps retained sessions accessible on partial load failure and retries the query', async () => {
    mocks.hasError = true;
    await render();
    expect(container.textContent).toContain('Retained task');
    await click('retry');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('keeps the picker open when the restored tab cannot be loaded into the layout', async () => {
    mocks.focus.mockReturnValue(false);
    await render();
    await click('codex: Retained task');
    expect(mocks.fetchLayout).toHaveBeenCalledWith('ws');
    expect(mocks.close).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toBe('resumeFailed');
  });

  it('searches retained directories, shows empty results and supports keyboard selection', async () => {
    await render();
    const input = container.querySelector('input')!;
    const search = async (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await search('/retained');
    expect(container.textContent).toContain('Retained task');
    await search('missing');
    expect(container.textContent).toContain('searchEmpty');
    await search('');
    input.focus();
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.getAttribute('aria-label')).toBe('claudeNewConversation');
  });

  it('passes the resolved launch command and retains the picker on creation failure', async () => {
    mocks.create.mockResolvedValueOnce(false);
    await render(true);
    await click('codexNewConversation');
    expect(mocks.create).toHaveBeenCalledWith('codex-cli', { command: 'codex-launch' });
    expect(mocks.close).not.toHaveBeenCalled();
    await click('codexNewConversation');
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('mounts the real mobile dialog with the shared picker', async () => {
    await act(async () => root.render(createElement(MobileNewTabDialog, {
      paneId: 'origin-pane', open: true, onOpenChange: mocks.close, onCreateTab: mocks.create,
    })));
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Retained task');
    expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain('Web Browser');
  });
});
