export const isClaudeTuiReadyContent = (content: string): boolean => {
  const tail = content.trimEnd().split('\n').slice(-14);
  if (/esc to (?:interrupt|cancel|stop)/i.test(tail.join('\n'))) return false;
  // A Claude composer is framed by horizontal rules. Menu selections also use
  // ❯, so the marker alone is not enough to recover a lost session-start event.
  const rule = /^\s*[─━]{8,}\s*$/;
  return tail.some((line, index) => /^\s*❯(?:\s|$)/.test(line)
    && index > 0 && rule.test(tail[index - 1])
    && tail.slice(index + 1).some((next) => rule.test(next)));
};
