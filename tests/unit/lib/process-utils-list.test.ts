import { describe, expect, it } from 'vitest';
import { parseSystemProcesses } from '@/lib/process-utils';

describe('process table parsing', () => {
  it('parses macOS/Linux date spacing, keeps arguments intact and ignores zombies/malformed rows', () => {
    const rows = parseSystemProcesses([
      ' 123  5 1000 Mon Oct 19 18:05:01 2026 S+ /opt/codex resume thread',
      ' 124  5 1000 Thu Oct  1 08:05:01 2026 Ss node /pkg/@anthropic-ai/claude-code/cli.js',
      ' 125  5 1000 Mon Oct 19 18:05:01 2026 Z codex <defunct>',
      'invalid',
    ].join('\n'));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ pid: 123, ppid: 5, uid: 1000, args: '/opt/codex resume thread' });
    expect(Number.isFinite(Date.parse(rows[1].startedAt))).toBe(true);
  });
});
