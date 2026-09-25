import { describe, expect, it } from 'vitest';
import { readCodexStatusLine } from '@/lib/codex-status-line';

describe('Codex rendered status line', () => {
  it('preserves configured field order and wording while excluding shortcut hints', () => {
    const status = 'GPT-6-Astra medium · ~/project · 会话标题 · Full Access · never · Context 45% left · weekly 36% left · 502K used';
    expect(readCodexStatusLine(`• Working\n\n› Ask Codex to do anything\n\n  ${status}\n  ? for shortcuts             ⚠ 2 warnings · f2 to view\n`)).toBe(status);
  });
  it('supports multiline status text and excludes multiline composer input', () => {
    expect(readCodexStatusLine('› draft text\n  second draft line\n\n  model · project\n  Context 20% used\n  ? for shortcuts')).toBe('model · project\nContext 20% used');
  });
  it('does not show transcript output, shell output, or shortcut hints as status', () => {
    expect(readCodexStatusLine('model · project\n$ shell')).toBeNull();
    expect(readCodexStatusLine('› prompt\n\n? for shortcuts')).toBeNull();
    expect(readCodexStatusLine('› prompt\n\nold text\n1\n2\n3\n4\n5\n6\n7\n8\n')).toBeNull();
  });
  it('uses the latest composer and clears while input is disabled', () => {
    expect(readCodexStatusLine('› old\n\nold model\n› new\n\nnew model\n? for shortcuts')).toBe('new model');
    expect(readCodexStatusLine('› Input disabled.\n\nmodel')).toBeNull();
  });
});
