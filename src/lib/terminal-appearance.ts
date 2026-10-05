import type { ITheme, Terminal } from '@xterm/xterm';
import { regionFontFamily, type IRegionTypography } from '@/lib/region-typography';

export const DEFAULT_TERMINAL_FONT_FAMILY = "'MesloLGLDZ', 'Apple SD Gothic Neo', 'Pretendard', 'Menlo', 'Monaco', 'Courier New', monospace";

export const resolveTerminalTypography = (base: { fontSize?: number; theme?: ITheme; fontFamily?: string }, style?: IRegionTypography) => ({
  ...base,
  fontSize: style?.fontSize ?? base.fontSize,
  fontFamily: style?.fontFamily ? `${regionFontFamily(style.fontFamily)}, ${base.fontFamily ?? DEFAULT_TERMINAL_FONT_FAMILY}` : base.fontFamily,
  theme: style?.color ? { ...base.theme, foreground: style.color } : base.theme,
});

export const applyTerminalTheme = (terminal: Pick<Terminal, 'options' | 'rows' | 'refresh'>, theme: ITheme = {}): void => {
  const current = terminal.options.theme ?? {};
  const keys = new Set([...Object.keys(current), ...Object.keys(theme)]) as Set<keyof ITheme>;
  if ([...keys].every((key) => current[key] === theme[key])) return;
  terminal.options.theme = { ...theme };
  terminal.refresh(0, terminal.rows - 1);
};
