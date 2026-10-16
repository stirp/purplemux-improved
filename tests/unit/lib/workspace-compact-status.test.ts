// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WorkspaceStatusIndicator from '@/components/features/workspace/workspace-status-indicator';
import WorkspaceItem from '@/components/features/workspace/workspace-item';
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

const render = async (compact = true) => {
  await act(async () => root.render(createElement(WorkspaceStatusIndicator, { workspaceId: 'ws', compact })));
};
const agent = (id: string, cliState: 'busy' | 'needs-input' | 'ready-for-review' | 'idle') => {
  useTabStore.getState().initTab(id, { workspaceId: 'ws', panelType: 'codex-cli', agentSessionId: id, cliState });
};

it('associates each workspace row with its current full status description', async () => {
  agent('running', 'busy');
  agent('waiting', 'needs-input');
  const item = (id: string) => createElement(WorkspaceItem, {
    key: id, workspace: { id, name: id, directories: [] }, isActive: false,
    isDeleting: false, showShortcut: false, onSelect: vi.fn(), onRename: vi.fn(), onDelete: vi.fn(),
  });
  useTabStore.getState().initTab('other-agent', { workspaceId: 'other', panelType: 'codex-cli', agentSessionId: 'other-agent', cliState: 'ready-for-review' });
  await act(async () => root.render(createElement('div', null, item('ws'), item('other'))));
  const rows = Array.from(container.querySelectorAll<HTMLElement>('.workspace-tree-row-compact'));
  const description = (row: HTMLElement) => document.getElementById(row.getAttribute('aria-describedby') ?? '')!;
  expect(rows[0].getAttribute('aria-describedby')).toBeTruthy();
  expect(rows[0].getAttribute('aria-describedby')).not.toBe(rows[1].getAttribute('aria-describedby'));
  expect(description(rows[0]).getAttribute('aria-label')).toContain('statusNeedsInput');
  expect(description(rows[0]).getAttribute('aria-label')).toContain('statusBusy');
  expect(description(rows[0]).getAttribute('aria-label')).toContain('workStatus_in-progress');
  expect(description(rows[1]).getAttribute('aria-label')).toContain('workStatus_review');
  const statusId = rows[0].getAttribute('aria-describedby');
  await act(async () => useTabStore.setState({ statusWsConnected: false }));
  expect(rows[0].getAttribute('aria-describedby')).toBe(statusId);
  expect(description(rows[0]).getAttribute('aria-label')).toContain('statusUnknown');
  expect(description(rows[0]).getAttribute('aria-label')).not.toContain('statusNeedsInput');
  await act(async () => {
    useTabStore.setState({ statusWsConnected: true, tabs: { running: useTabStore.getState().tabs.running } });
  });
  expect(description(rows[0]).getAttribute('aria-label')).toContain('statusBusy');
  expect(description(rows[0]).getAttribute('aria-label')).not.toContain('statusNeedsInput');
  await act(async () => {
    useTabStore.setState({ tabs: { running: { ...useTabStore.getState().tabs.running, cliState: 'idle' } } });
    useWorkspaceStore.setState({ sessionWorkflow: { statuses: { 'codex:running': 'completed' }, collapsed: {} } });
  });
  expect(description(rows[0]).getAttribute('aria-label')).toContain('workStatus_completed');
  await act(async () => {
    useTabStore.setState({ statusWsConnected: true, tabs: {} });
    useWorkspaceStore.setState({ sessionWorkflow: { statuses: {}, collapsed: {} } });
  });
  expect(description(rows[0])).toBeNull();
});

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
