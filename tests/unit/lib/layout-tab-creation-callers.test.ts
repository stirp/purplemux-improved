// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ILayoutData, ITab, TPanelType } from '@/types/terminal';

type TCreateTab = (panelType?: TPanelType, options?: { command?: string; resumeSessionId?: string }) => Promise<void>;
const callbacks = vi.hoisted(() => ({ desktop: null as TCreateTab | null, mobile: null as TCreateTab | null }));

vi.mock('next/router', () => ({ default: {}, useRouter: () => ({ pathname: '/' }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({ t: (_namespace: string, key: string) => key }));
vi.mock('react-resizable-panels', () => ({ Group: () => null, Panel: () => null, Separator: () => null }));
vi.mock('@/hooks/use-terminal', () => ({ default: () => ({ isReady: false }) }));
vi.mock('@/hooks/use-terminal-websocket', () => ({ default: () => ({ status: 'disconnected' }) }));
vi.mock('@/hooks/use-native-commands', () => ({ default: () => ({}) }));
vi.mock('@/hooks/use-agent-status', () => ({ dismissTab: vi.fn() }));
vi.mock('@/hooks/use-agent-install-check', () => ({
  useAgentInstallCheck: () => ({ ensureAgentInstalled: async () => true, installDialogs: null }),
}));
vi.mock('@/hooks/use-trust-prompt-detector', () => ({ default: () => ({}) }));
vi.mock('@/hooks/use-codex-update-prompt-detector', () => ({ default: () => ({}) }));
vi.mock('@/hooks/use-quick-prompts', () => ({ default: () => ({ prompts: [] }) }));
vi.mock('@/hooks/use-is-mobile-device', () => ({ default: () => false }));
vi.mock('@/lib/providers/claude/client', () => ({ buildClaudeLaunchCommand: () => 'claude' }));
vi.mock('@/lib/providers/codex/client', () => ({ fetchCodexLaunchCommand: async () => 'codex' }));
vi.mock('@/components/features/workspace/claude-code-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/codex-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/agent-sessions-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/diff-panel', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/web-input-bar', () => ({ default: () => null }));
vi.mock('@/components/features/workspace/pane-tab-bar', () => ({
  default: ({ onCreateTab }: { onCreateTab: TCreateTab }) => { callbacks.desktop = onCreateTab; return null; },
}));
vi.mock('@/components/features/mobile/mobile-new-tab-dialog', () => ({
  default: ({ onCreateTab }: { onCreateTab: TCreateTab }) => { callbacks.mobile = onCreateTab; return null; },
}));
vi.mock('@/components/features/mobile/mobile-tab-header', () => ({ default: () => null }));
vi.mock('@/components/features/mobile/mobile-surface-view', () => ({ default: () => null }));
vi.mock('@/components/features/mobile/mobile-git-fullscreen', () => ({ default: () => null }));

import PaneContainer from '@/components/features/workspace/pane-container';
import MobileTerminalPage from '@/components/features/mobile/mobile-terminal-page';
import { useLayoutStore } from '@/hooks/use-layout';
import useTabStore from '@/hooks/use-tab-store';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';

const initialLayout = useLayoutStore.getState();
const initialTabs = useTabStore.getState();
const initialWorkspace = useWorkspaceStore.getState();
const initialMetadata = useTabMetadataStore.getState();
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  callbacks.desktop = null;
  callbacks.mobile = null;
  const layout: ILayoutData = {
    root: { type: 'pane', id: 'pane-test', tabs: [], activeTabId: null },
    activePaneId: 'pane-test', updatedAt: '2026-10-18T00:00:00Z',
  };
  useLayoutStore.setState({ workspaceId: 'ws-test', layout, isLoading: false, error: null });
  vi.spyOn(useLayoutStore.getState(), 'fetchLayout').mockResolvedValue();
  useTabStore.setState({ tabs: {} });
  useTabMetadataStore.setState({ metadata: {} });
  useWorkspaceStore.setState({
    workspaces: [{ id: 'ws-test', name: 'Test', directories: ['/repo/missing'] }],
    activeWorkspaceId: 'ws-test', isLoading: false, error: null,
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  useLayoutStore.setState(initialLayout, true);
  useTabStore.setState(initialTabs, true);
  useWorkspaceStore.setState(initialWorkspace, true);
  useTabMetadataStore.setState(initialMetadata, true);
  vi.unstubAllGlobals();
});

describe.each(['desktop', 'mobile'] as const)('%s tab creation caller', (platform) => {
  it('passes the shared picker launch command through unchanged', async () => {
    const tab: ITab = { id: 'new', sessionName: 'new', name: '', order: 0, cwd: '/repo/missing', panelType: 'codex-cli' };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => tab });
    vi.stubGlobal('fetch', fetchMock);
    await act(async () => root.render(platform === 'desktop'
      ? createElement(PaneContainer, { paneId: 'pane-test', paneNumber: 1 }) : createElement(MobileTerminalPage)));
    await act(async () => { await callbacks[platform]!('codex-cli', { command: 'codex --model custom' }); });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).command).toBe('codex --model custom');
    expect(useTabStore.getState().tabs.new.sessionView).toBe('check');
  });

  describe.each(['claude-code', 'codex-cli'] as const)('%s', (panelType) => {
    it.each([
      ['command', true], ['resume', true], ['plain', true],
      ['command', false], ['resume', false], ['plain', false],
    ] as const)('preserves launch state for %s with cwd fallback=%s', async (launch, fallback) => {
      const tab: ITab = {
        id: 'tab-new', sessionName: 'session-new', name: '', order: 0,
        panelType, cwd: fallback ? '/repo' : '/repo/missing',
      };
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => tab });
      vi.stubGlobal('fetch', fetchMock);
      await act(async () => root.render(platform === 'desktop'
        ? createElement(PaneContainer, { paneId: 'pane-test', paneNumber: 1 })
        : createElement(MobileTerminalPage)));

      const provider = panelType === 'claude-code' ? 'claude' : 'codex';
      const command = platform === 'mobile' ? `${provider}-new` : provider;
      const options = launch === 'command' ? { command }
        : launch === 'resume' ? { resumeSessionId: 'session-id' } : undefined;
      expect(callbacks[platform]).toBeTypeOf('function');
      await act(async () => { await callbacks[platform]!(panelType, options); });

      expect(fetchMock).toHaveBeenCalledWith('/api/layout/pane/pane-test/tabs?workspace=ws-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cwd: '/repo/missing', panelType,
          command: launch === 'command' ? provider : undefined,
          resumeSessionId: launch === 'resume' ? 'session-id' : undefined,
        }),
      });
      expect(useTabStore.getState().tabs[tab.id]).toMatchObject({
        panelType, workspaceId: 'ws-test',
        sessionView: !fallback && launch !== 'plain' ? 'check' : 'session-list',
      });
      expect(useLayoutStore.getState().layout?.root).toMatchObject({ tabs: [tab], activeTabId: tab.id });
    });
  });
});
