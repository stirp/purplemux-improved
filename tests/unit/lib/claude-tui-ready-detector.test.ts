import { describe, expect, it } from 'vitest';
import { isClaudeTuiReadyContent } from '@/lib/claude-tui-ready-detector';
const composer = '────────────────────\n❯ Try a prompt\n────────────────────\n  bypass permissions on';
describe('Claude input readiness', () => {
  it('recognizes an idle native composer, including a multiline draft', () => {
    expect(isClaudeTuiReadyContent(composer)).toBe(true);
    expect(isClaudeTuiReadyContent(composer.replace('Try a prompt', 'draft\n  second line'))).toBe(true);
  });
  it('does not mistake shell prompts, trust dialogs or command menus for input readiness', () => {
    for (const content of ['❯ shell', 'Trust this folder?\n❯ 1. Yes\n  2. No', '────────────────────\n❯ /model\n  Opus\n  Sonnet', '']) {
      expect(isClaudeTuiReadyContent(content)).toBe(false);
    }
  });
  it('does not mark a busy agent idle or reuse an old composer in scrollback', () => {
    expect(isClaudeTuiReadyContent(composer + '\nesc to interrupt')).toBe(false);
    expect(isClaudeTuiReadyContent(composer + '\noutput'.repeat(20))).toBe(false);
  });
});
