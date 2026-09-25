import { isCodexTuiReadyContent } from '@/lib/codex-tui-ready-detector';

export const readCodexStatusLine = (content: string): string | null => {
  if (!isCodexTuiReadyContent(content)) return null;
  const lines = content.trimEnd().split('\n');
  const promptIndex = lines.findLastIndex((line) => /^\s*›(?:\s|$)/.test(line));
  if (promptIndex < 0) return null;
  const separator = lines.findIndex((line, index) => index > promptIndex && !line.trim());
  if (separator < 0) return null;
  const footer = lines.slice(separator + 1).map((line) => line.trim()).filter(Boolean);
  const shortcutIndex = footer.findIndex((line) => /^\? for shortcuts\b/.test(line));
  const status = (shortcutIndex >= 0 ? footer.slice(0, shortcutIndex) : footer).join('\n');
  return status || null;
};
