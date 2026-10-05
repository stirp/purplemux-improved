import { describe, expect, it, vi } from 'vitest';
import { applyTerminalTheme, resolveTerminalTypography } from '@/lib/terminal-appearance';

describe('terminal appearance', () => {
  it('resolves overrides explicitly while keeping mobile and agent defaults when unset', () => {
    for (const fontSize of [11, 12, 14, undefined]) {
      const base = { fontSize, theme: { foreground: '#ffffff', red: '#ff0000' } };
      expect(resolveTerminalTypography(base).fontSize).toBe(fontSize);
      expect(resolveTerminalTypography(base).theme).toBe(base.theme);
      const resolved = resolveTerminalTypography(base, { fontSize: 18, fontFamily: 'Mono', color: '#123456' });
      expect(resolved.fontSize).toBe(18);
      expect(resolved.fontFamily).toContain('"Mono"');
      expect(resolved.theme).toEqual({ foreground: '#123456', red: '#ff0000' });
    }
  });
  it('refreshes visible rows on a foreground-only change while preserving ANSI colors', () => {
    const terminal = { rows: 24, options: { theme: { foreground: '#ffffff', red: '#ff0000' } }, refresh: vi.fn() };
    applyTerminalTheme(terminal, { foreground: '#aabbcc', red: '#ff0000' });
    expect(terminal.options.theme).toEqual({ foreground: '#aabbcc', red: '#ff0000' });
    expect(terminal.refresh).toHaveBeenCalledWith(0, 23);
    applyTerminalTheme(terminal, { red: '#ff0000', foreground: '#aabbcc' });
    expect(terminal.refresh).toHaveBeenCalledOnce();
  });

  it('restores default theme values when the custom override is removed', () => {
    const terminal = { rows: 10, options: { theme: { foreground: '#aabbcc' } }, refresh: vi.fn() };
    applyTerminalTheme(terminal);
    expect(terminal.options.theme).toEqual({});
    expect(terminal.refresh).toHaveBeenCalledWith(0, 9);
  });
});
