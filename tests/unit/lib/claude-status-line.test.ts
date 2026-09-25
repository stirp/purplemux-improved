import { describe, expect, it } from 'vitest';
import { readClaudeStatusLine } from '@/lib/claude-status-line';
const composer = 'Claude Code\n────────────────────\n❯ Draft\n  continuation\n────────────────────\n';
describe('Claude native status line', () => {
  it('preserves custom text and multiple lines without shortcut hints', () => {
    expect(readClaudeStatusLine(composer + '  🤖 Sonnet | 🌿 task/test\n  Context 20%\n  ⏵⏵ bypass permissions on\n')).toBe('🤖 Sonnet | 🌿 task/test\nContext 20%');
  });
  it('hides unconfigured status lines and menus', () => {
    expect(readClaudeStatusLine(composer + '  ? for shortcuts')).toBeNull();
    expect(readClaudeStatusLine(composer + '  ⏵⏵ bypass permissions on')).toBeNull();
    expect(readClaudeStatusLine('Select model\n❯ Opus\nSonnet')).toBeNull();
  });
  it('ignores old composers in scrollback and keeps the latest footer', () => {
    expect(readClaudeStatusLine(composer + 'old\n' + composer + 'new')).toBe('new');
    expect(readClaudeStatusLine(composer + 'output\n'.repeat(20))).toBeNull();
  });
});
