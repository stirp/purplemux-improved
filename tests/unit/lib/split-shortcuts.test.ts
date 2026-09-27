import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIONS, applyKeybindingOverrides, getResolvedKey, matchesAction } from '@/lib/keyboard-shortcuts';

const platform = vi.hoisted(() => ({ mac: false }));
vi.mock('@/hooks/use-is-mac', () => ({ default: () => platform.mac }));
vi.mock('@/hooks/use-keybindings-store', () => ({ useResolvedKey: (id: keyof typeof ACTIONS) => getResolvedKey(id) }));
vi.mock('@/components/layout/system-resources', () => ({ default: () => null }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

import ContentHeader from '@/components/features/workspace/content-header';

const renderHeader = () => renderToStaticMarkup(createElement(ContentHeader, {
  activePaneId: 'pane',
  root: { type: 'pane', id: 'pane', tabs: [], activeTabId: null },
  paneCount: 1,
  canSplit: true,
  isSplitting: false,
  onSplitPane: vi.fn(),
  onEqualizeRatios: vi.fn(),
  isGitPanelOpen: false,
  onToggleGitPanel: vi.fn(),
}));

afterEach(() => {
  applyKeybindingOverrides({});
  platform.mac = false;
});

describe('split shortcut hints', () => {
  it('shows distinct defaults with an explicit Shift label on Windows/Linux', () => {
    const html = renderHeader();
    expect(html).toContain('>Ctrl+D</span>');
    expect(html).toContain('>Ctrl+Shift+D</span>');
  });

  it.each([
    [false, 'ctrl+alt+v', 'Ctrl+Alt+V'],
    [true, 'meta+alt+v', '⌘⌥V'],
  ])('shows the customized binding on mac=%s', (mac, key, label) => {
    platform.mac = mac;
    applyKeybindingOverrides({ 'pane.split_right': key, 'pane.split_down': null });
    const html = renderHeader();
    expect(html).toContain(`>${label}</span>`);
    expect(html).not.toContain('>Ctrl+D</span>');
    expect(html).not.toContain('>Ctrl+Shift+D</span>');
    expect(html).not.toContain('>⌘⇧D</span>');
  });

  it('distinguishes the default actions by Shift and honors custom/disabled bindings', () => {
    const event = { code: 'KeyD', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false } as KeyboardEvent;
    expect(matchesAction(event, 'pane.split_right')).toBe(true);
    expect(matchesAction(event, 'pane.split_down')).toBe(false);
    const shifted = { ...event, shiftKey: true };
    expect(matchesAction(shifted, 'pane.split_right')).toBe(false);
    expect(matchesAction(shifted, 'pane.split_down')).toBe(true);
    applyKeybindingOverrides({ 'pane.split_right': 'ctrl+alt+v', 'pane.split_down': null });
    expect(matchesAction(event, 'pane.split_right')).toBe(false);
    expect(matchesAction(shifted, 'pane.split_down')).toBe(false);
    expect(matchesAction({ ...event, code: 'KeyV', altKey: true }, 'pane.split_right')).toBe(true);
  });
});
