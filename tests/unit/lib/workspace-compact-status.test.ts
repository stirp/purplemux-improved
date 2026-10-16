// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceStatusIndicator from '@/components/features/workspace/workspace-status-indicator';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabStore from '@/hooks/use-tab-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

const initialWorkspace = useWorkspaceStore.getState();
const initialTabs = useTabStore.getState();
const initialHistory = useSessionHistoryStore.getState();
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  useWorkspaceStore.setState({ sessionWorkflow: { statuses: {}, collapsed: {} } });
  useTabStore.setState({ tabs: {}, statusWsConnected: true });
  useSessionHistoryStore.setState({ entries: [] });
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  useWorkspaceStore.setState(initialWorkspace);
  useTabStore.setState(initialTabs);
  useSessionHistoryStore.setState(initialHistory);
  vi.unstubAllGlobals();
});

const render = async (compact = true) => {
  await act(async () => root.render(createElement(WorkspaceStatusIndicator, { workspaceId: 'ws', compact })));
};
const agent = (id: string, cliState: 'busy' | 'needs-input' | 'ready-for-review' | 'idle') => {
  useTabStore.getState().initTab(id, { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: id, cliState });
};

describe('compact workspace status', () => {
  it('hides the pending stage in compact mode and preserves mobile presentation', async () => {
    await render();
    expect(container.innerHTML).toBe('');
    await render(false);
    expect(container.textContent).toContain('workStatus_pending');
  });

  it('prioritizes waiting for input while preserving a parallel running agent in the tooltip', async () => {
    agent('running', 'busy');
    agent('waiting', 'needs-input');
    await render();
    expect(container.textContent).toBe('statusNeedsInput');
    expect(container.querySelector('[role="img"]')?.getAttribute('title')).toContain('statusBusy');
    expect(container.querySelector('[role="img"]')?.getAttribute('title')).toContain('workStatus_in-progress');
  });

  it('does not present a disconnected agent as running', async () => {
    agent('running', 'busy');
    useTabStore.setState({ statusWsConnected: false });
    await render();
    expect(container.textContent).toBe('statusUnknown');
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('keeps the review workflow stage distinct from an input request', async () => {
    agent('finished', 'ready-for-review');
    await render();
    expect(container.textContent).toBe('workStatus_review');
    expect(container.textContent).not.toContain('statusNeedsInput');
  });

  it('uses a labeled icon for manually completed work', async () => {
    agent('done', 'idle');
    useWorkspaceStore.setState({ sessionWorkflow: { statuses: { 'codex:done': 'completed' }, collapsed: {} } });
    await render();
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toContain('workStatus_completed');
    expect(container.textContent).toBe('');
  });
});
