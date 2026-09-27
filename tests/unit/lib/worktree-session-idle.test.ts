import { describe, expect, it } from 'vitest';
import '@/lib/providers';
import { getStatusManager } from '@/lib/status-manager';
import type { ITabStatusEntry } from '@/types/status';

const manager = getStatusManager();
const check = (overrides: Partial<ITabStatusEntry>) => {
  manager.registerTab('idle-check', {
    workspaceId: 'ws-test', tabName: 'Test', tmuxSession: 'pt-idle-check',
    panelType: 'codex-cli', cliState: 'idle', ...overrides,
  });
  return manager.areSessionsIdle(['pt-idle-check']);
};

describe('worktree session idle checks', () => {
  it.each(['idle', 'ready-for-review', 'cancelled'] as const)('allows settled agent state %s', (cliState) => {
    expect(check({ cliState })).toBe(true);
  });
  it.each(['busy', 'needs-input', 'unknown'] as const)('blocks agent state %s', (cliState) => {
    expect(check({ cliState, terminalStatus: 'idle' })).toBe(false);
  });
  it('requires an idle shell for terminals and inactive agents', () => {
    expect(check({ panelType: 'terminal', terminalStatus: 'running' })).toBe(false);
    expect(check({ panelType: 'terminal', terminalStatus: 'server' })).toBe(false);
    expect(check({ panelType: 'terminal' })).toBe(false);
    expect(check({ panelType: 'terminal', terminalStatus: 'idle' })).toBe(true);
    expect(check({ cliState: 'inactive' })).toBe(false);
    expect(check({ cliState: 'inactive', terminalStatus: 'idle' })).toBe(true);
  });
  it('blocks compacting and unknown sessions, including mixed selections', () => {
    expect(check({ compactingSince: Date.now() })).toBe(false);
    expect(check({})).toBe(true);
    expect(manager.areSessionsIdle(['pt-idle-check', 'pt-unknown'])).toBe(false);
  });
});
