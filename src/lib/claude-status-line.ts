export const readClaudeStatusLine = (content: string): string | null => {
  const lines = content.trimEnd().split('\n');
  const rule = /^\s*[─━]{8,}\s*$/;
  const prompt = lines.findLastIndex((line, index) => /^\s*❯(?:\s|$)/.test(line)
    && index > 0 && rule.test(lines[index - 1]));
  if (prompt < 0) return null;
  const separator = lines.findIndex((line, index) => index > prompt && rule.test(line));
  if (separator < 0 || lines.length - separator > 12) return null;
  const footer: string[] = [];
  for (const line of lines.slice(separator + 1)) {
    const text = line.trim();
    if (/^(?:⏵|\? for shortcuts|shift\+tab to|esc to|ctrl\+|Tip:)/i.test(text)) break;
    if (text) footer.push(text);
  }
  return footer.join('\n') || null;
};
