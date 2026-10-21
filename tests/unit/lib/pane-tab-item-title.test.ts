// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PaneTabItem from '@/components/features/workspace/pane-tab-item';
import type { ITab, TPanelType } from '@/types/terminal';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
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

const render = async (providerId: string, name: string, displayTitle: string, panelType: TPanelType = 'terminal') => {
  const tab: ITab = { id: 'tab', sessionName: 'tmux', order: 0, panelType, name,
    agentState: { providerId, sessionId: 'root', jsonlPath: '/root.jsonl', summary: null } };
  await act(async () => root.render(createElement(PaneTabItem, {
    tab, displayTitle, isActive: true, isDragging: false, dropSide: null,
    onSwitch: vi.fn(), onDelete: vi.fn(), onRename: vi.fn(), onFocusPane: vi.fn(),
    onDragStart: vi.fn(), onDragEnd: vi.fn(), onDragOver: vi.fn(), onDragLeave: vi.fn(),
  })));
};

describe('Agent-bound Terminal tab names', () => {
  it.each(['codex', 'claude'])('keeps the custom name and saved rename visible for %s', async (providerId) => {
    for (const displayTitle of ['Codex', 'Claude', 'bash']) {
      await render(providerId, '自定义名称', displayTitle);
      expect(container.querySelector('[role="tab"]')?.textContent).toBe('自定义名称');
      await render(providerId, '重命名后的名称', displayTitle);
      expect(container.querySelector('[role="tab"]')?.textContent).toBe('重命名后的名称');
    }
    await act(async () => container.querySelector('[role="tab"]')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(container.querySelector('input')?.value).toBe('重命名后的名称');
  });

  it.each(['codex', 'claude'])('falls back to the process title without a custom name for %s', async (providerId) => {
    await render(providerId, '', 'bash');
    expect(container.querySelector('[role="tab"]')?.textContent).toBe('bash');
  });

  it.each(['codex-cli', 'claude-code'] as const)('keeps upstream resolved titles authoritative in %s', async (panelType) => {
    await render(panelType === 'codex-cli' ? 'codex' : 'claude', 'Tab 名称', '已解析的会话名称', panelType);
    expect(container.querySelector('[role="tab"]')?.textContent).toBe('已解析的会话名称');
  });
});
