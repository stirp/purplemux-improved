import { describe, expect, it } from 'vitest';
import { CLAUDE_LAUNCHER_SCRIPT } from '@/lib/providers/claude/launcher';
import { isValidAgentEnvironment } from '@/lib/agent-environment';
import { isLegacyClaudeLauncher } from '@/lib/legacy-claude-launcher';

// Captured validator forms from dist/server.js and the webpack production chunk.
const serverValidator = String.raw`(value) => typeof value === "object" && value !== null && !Array.isArray(value) && Object.entries(value).every(([key, entry]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof entry === "string" && !entry.includes("\0"))`;
const browserValidator = String.raw`a=>"object"==typeof a&&null!==a&&!Array.isArray(a)&&Object.entries(a).every(([a,b])=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(a)&&"string"==typeof b&&!b.includes("\0"))`;

describe('historical Claude inline launcher recognition', () => {
  it.each([serverValidator, browserValidator])('accepts approved build output after historical command flattening', (validator) => {
    const script = CLAUDE_LAUNCHER_SCRIPT.replace(isValidAgentEnvironment.toString(), validator)
      .trim().replace(/\n\s*/g, ' ');
    expect(isLegacyClaudeLauncher(script)).toBe(true);
  });
  it('ignores formatting and equivalent literal spelling without evaluating the program', () => {
    const script = CLAUDE_LAUNCHER_SCRIPT.replace("'node:fs'", '"node:fs"')
      .replace(isValidAgentEnvironment.toString(), `(/* compiled */ ${serverValidator})`);
    expect(isLegacyClaudeLauncher(script)).toBe(true);
  });
  it.each([
    (script: string) => script.replace("spawn('claude'", "spawn('codex'"),
    (script: string) => script.replace("'.purplemux'", "'.other'"),
    (script: string) => script.replace('!Array.isArray', 'Array.isArray'),
    (script: string) => script.replace('120000', '1'),
    (script: string) => script.replace('config === null', 'config === 1e400'),
    (script: string) => `${script}\nprocess.exit(0);`,
    (script: string) => script.replace(isValidAgentEnvironment.toString(), '() => true'),
  ])('rejects modified behavior', (modify) => {
    expect(isLegacyClaudeLauncher(modify(CLAUDE_LAUNCHER_SCRIPT))).toBe(false);
  });
  it('rejects incomplete, oversized and unknown code without throwing', () => {
    for (const script of [undefined, '', 'require(', 'process.exit(0)', ' '.repeat(65537)]) {
      expect(isLegacyClaudeLauncher(script)).toBe(false);
    }
  });
});
