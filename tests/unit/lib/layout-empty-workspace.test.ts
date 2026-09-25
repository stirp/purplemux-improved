import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tmux', () => ({
  createSession: vi.fn(),
  workspaceSessionName: (workspace: string, pane: string, tab: string) => `${workspace}-${pane}-${tab}`,
}));
vi.mock('@/lib/sync-server', () => ({ broadcastSync: vi.fn() }));

import { createDefaultLayout, crossCheckLayout } from '@/lib/layout-store';
import { createSession } from '@/lib/tmux';

beforeEach(() => vi.clearAllMocks());

describe('empty workspace layout', () => {
  it('creates an active empty pane without starting a terminal', async () => {
    const layout = await createDefaultLayout('ws-test', '/tmp', { empty: true });
    expect(layout.root).toMatchObject({ type: 'pane', tabs: [], activeTabId: null });
    if (layout.root.type !== 'pane') throw new Error('Expected pane');
    expect(layout.activePaneId).toBe(layout.root.id);
    expect(await crossCheckLayout(layout, [], 'ws-test', '/tmp')).toBe(false);
    expect(createSession).not.toHaveBeenCalled();
  });

  it('preserves explicit agent tabs for session resume', async () => {
    const layout = await createDefaultLayout('ws-test', '/tmp', { panelType: 'codex-cli' });
    expect(layout.root.type).toBe('pane');
    if (layout.root.type !== 'pane') throw new Error('Expected pane');
    expect(layout.root.tabs).toHaveLength(1);
    expect(layout.root.tabs[0]).toMatchObject({ panelType: 'codex-cli', cwd: '/tmp' });
    expect(layout.root.activeTabId).toBe(layout.root.tabs[0].id);
    expect(createSession).toHaveBeenCalledOnce();
  });
});
