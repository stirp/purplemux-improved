import { describe, expect, it } from 'vitest';
import '@/lib/providers';
import { getStatusManager } from '@/lib/status-manager';
import type { ITabStatusEntry } from '@/types/status';

const manager = getStatusManager();
const check = (overrides: Partial<ITabStatusEntry>) => {
  manager.registerTab('idle-check', {
    workspaceId: 'ws-test', tabName: 'Test', tmuxSession: 'pt-idle-check',
    panelType: 'codex-cli', cliState: 'idle', currentProcess: 'bash', ...overrides,
  });
  return manager.areSessionsIdle(['pt-idle-check']);
};

describe('worktree session idle checks', () => {
  it.each(['codex', 'claude'])('protects Terminal foreground tasks even with an idle %s binding', (agentProviderId) => {
    for (const panelType of ['terminal', undefined] as const) {
      for (const cliState of ['idle', 'ready-for-review', 'cancelled', 'inactive'] as const) {
        for (const currentProcess of ['make', 'vim', 'node', 'codex', 'claude', undefined]) {
          expect(check({ agentProviderId, panelType, cliState, terminalStatus: 'idle', currentProcess })).toBe(false);
        }
        expect(check({ agentProviderId, panelType, cliState, terminalStatus: 'idle', currentProcess: 'bash' })).toBe(true);
      }
      expect(check({ agentProviderId, panelType, cliState: 'busy', terminalStatus: 'idle', currentProcess: 'bash' })).toBe(false);
      expect(check({ agentProviderId, panelType, cliState: 'idle', terminalStatus: 'server', currentProcess: 'bash' })).toBe(false);
    }
  });

  it.each(['codex', 'claude'])('uses strict foreground evidence for a Terminal bound to %s', (agentProviderId) => {
    check({ agentProviderId, panelType: 'terminal', cliState: 'idle', terminalStatus: 'idle', currentProcess: 'bash' });
    const pane = { command: 'make', path: '/repo', pid: 123, windowActivity: 0 };
    expect(manager.areSessionsIdle(['pt-idle-check'], new Map([['pt-idle-check', pane]]))).toBe(false);
    expect(manager.areSessionsIdle(['pt-idle-check'], new Map())).toBe(false);
    check({ agentProviderId, panelType: 'terminal', cliState: 'idle', terminalStatus: 'idle', currentProcess: 'make' });
    expect(manager.areSessionsIdle(['pt-idle-check'], new Map([['pt-idle-check', { ...pane, command: 'bash' }]]))).toBe(true);
  });

  it.each(['claude-code', 'codex-cli', 'terminal'] as const)('blocks non-shell foreground commands in %s', (panelType) => {
    for (const currentProcess of ['node', 'vim', 'make', undefined]) {
      expect(check({ panelType, cliState: 'inactive', terminalStatus: 'idle', currentProcess })).toBe(false);
    }
  });

  it('uses the strict pane snapshot instead of cached foreground metadata', () => {
    check({ cliState: 'inactive', terminalStatus: 'idle', currentProcess: 'bash' });
    const pane = { command: 'node', path: '/repo', pid: 123, windowActivity: 0 };
    expect(manager.areSessionsIdle(['pt-idle-check'], new Map([['pt-idle-check', pane]]))).toBe(false);
    expect(manager.areSessionsIdle(['pt-idle-check'], new Map())).toBe(false);
    expect(manager.areSessionsIdle(['pt-idle-check'], new Map([['pt-idle-check', { ...pane, command: 'bash' }]]))).toBe(true);
  });
  it.each(['claude-code', 'codex-cli'] as const)('allows settled states for %s', (panelType) => {
    for (const cliState of ['idle', 'ready-for-review', 'cancelled'] as const) {
      expect(check({ panelType, cliState })).toBe(true);
    }
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
