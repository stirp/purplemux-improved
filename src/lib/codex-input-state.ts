import { stripVTControlCharacters } from 'node:util';
import { isCodexTuiReadyContent } from '@/lib/codex-tui-ready-detector';

// tmux preserves SGR attributes with capture-pane -e; Codex renders placeholders dimmed.
const withoutDimmedText = (content: string): string => {
  const sgr = new RegExp(`${String.fromCharCode(27)}\\[([0-9;:]*)m`, 'g');
  let dimmed = false;
  let offset = 0;
  let result = '';
  for (const match of content.matchAll(sgr)) {
    const text = content.slice(offset, match.index);
    result += dimmed ? text.replace(/[^\n]/g, ' ') : text;
    const codes = match[1].split(';');
    for (let index = 0; index < codes.length; index++) {
      const code = Number(codes[index]);
      if (code === 0 || code === 22) dimmed = false;
      if (code === 2) dimmed = true;
      // RGB/indexed color components are not independent SGR attributes.
      if (code === 38 || code === 48 || code === 58) index += codes[index + 1] === '2' ? 4 : 2;
    }
    offset = match.index + match[0].length;
  }
  const tail = content.slice(offset);
  return stripVTControlCharacters(result + (dimmed ? tail.replace(/[^\n]/g, ' ') : tail));
};

export const readCodexInputState = (
  content: string | null,
  cursor: { x: number; y: number } | null,
): 'empty' | 'occupied' | 'unknown' => {
  if (!content || !cursor) return 'unknown';
  const plain = stripVTControlCharacters(content);
  if (!isCodexTuiReadyContent(plain)) return 'unknown';
  const lines = plain.split('\n');
  const row = lines.findLastIndex((line) => /^\s*›(?:\s|$)/.test(line));
  if (row < 0) return 'unknown';
  const marker = /^(\s*)›/.exec(lines[row])!;
  if (cursor.y !== row || cursor.x !== marker[1].length + 2) return 'occupied';
  if (withoutDimmedText(content).split('\n')[row].trim() !== '›') return 'occupied';
  if (lines[row + 1]?.trim()) return 'occupied';
  // Attachment/paste chips can be dimmed, but they are still submitted content.
  if (/\[(?:Image #\d+|Pasted[^\]]*)\]/i.test(lines.slice(Math.max(0, row - 1), row + 1).join('\n'))) return 'occupied';
  return 'empty';
};
