import { describe, expect, it } from 'vitest';
import { readCodexInputState } from '@/lib/codex-input-state';

const screen = (composer: string) => `Previous output\n\n${composer}\n\n  GPT-6 · Full Access\n  ? for shortcuts\n`;
const start = { x: 2, y: 2 };

describe('Codex input state before queued paste', () => {
  it('accepts an empty composer and dimmed random placeholders', () => {
    expect(readCodexInputState(screen('› '), start)).toBe('empty');
    expect(readCodexInputState(screen('\x1b[1m›\x1b[0m\x1b[48;2;236;238;240m \x1b[2mAsk Codex to do anything\x1b[0m'), start)).toBe('empty');
    expect(readCodexInputState(screen('› \x1b[2;38;2;2;22;0mExplain this codebase\x1b[0m'), start)).toBe('empty');
  });

  it.each([
    '› 确定',
    '› \x1b[38;2;2;22;0m确定\x1b[0m',
    '› \x1b[2mplaceholder\x1b[22m确定',
    '› \x1b[2m[Image #1]\x1b[0m',
    '› \x1b[2m[Pasted Content 1234 chars]\x1b[0m',
    '› \n  second line',
    '[Image #1]\n› ',
  ])('rejects existing input even with the cursor moved to the start: %s', (composer) => {
    const cursor = { ...start, y: composer.startsWith('[Image') ? 3 : 2 };
    expect(readCodexInputState(screen(composer), cursor)).toBe('occupied');
  });

  it('rejects a cursor within a draft or on a continuation line', () => {
    expect(readCodexInputState(screen('› \x1b[2m确定\x1b[0m'), { x: 6, y: 2 })).toBe('occupied');
    expect(readCodexInputState(screen('› \n\n  draft'), { x: 7, y: 4 })).toBe('occupied');
  });

  it('rejects the PR #88 multiline draft with its cursor at the beginning', () => {
    expect(readCodexInputState('› \n\n  existing draft\n\n  GPT-6 · Full Access\n  ? for shortcuts', { x: 2, y: 0 })).toBe('occupied');
  });

  it.each([
    '› \n\n  existing draft',
    '› \n\n\n  existing draft',
    '› \n  \n  existing draft',
    '› \n\n  existing draft\n',
    '› \n\n  existing draft\n\n',
    '› \n\n  \x1b[2m[Image #1]\x1b[0m',
    '› \n\n  ? for shortcuts',
    '› \n\n',
  ])('rejects continuation rows before the footer: %s', (composer) => {
    expect(readCodexInputState(screen(composer) + '\n'.repeat(20), start)).toBe('occupied');
  });

  it.each([
    '  GPT-6 · Full Access\n  ? for shortcuts',
    '  custom model · project\n  Context 20% used\n  ? for shortcuts',
    '  gpt-5.5 high · ~/repo',
    '  100% context left',
    '  ? for shortcuts',
  ])('preserves empty composers with footer and trailing pane padding: %s', (footer) => {
    expect(readCodexInputState(`› \x1b[2mAsk Codex\x1b[0m\n\n${footer}\n\n\n`, { x: 2, y: 0 })).toBe('empty');
  });

  it('does not infer readiness from missing snapshots or modal/disabled screens', () => {
    expect(readCodexInputState(null, start)).toBe('unknown');
    expect(readCodexInputState(screen('› '), null)).toBe('unknown');
    expect(readCodexInputState(screen('› Input disabled.'), start)).toBe('unknown');
    expect(readCodexInputState(screen('› 1. Continue\n  2. Exit'), start)).toBe('unknown');
  });
});
