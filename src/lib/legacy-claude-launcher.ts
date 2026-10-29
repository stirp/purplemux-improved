import { parse } from 'acorn';
import { isValidAgentEnvironment } from '@/lib/agent-environment';
import { CLAUDE_LAUNCHER_SCRIPT } from '@/lib/providers/claude/launcher';

const scriptSignature = (script: string): string | null => {
  try {
    return JSON.stringify(parse(script, { ecmaVersion: 'latest' }), (key, value) => {
      if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite literal');
      return key === 'start' || key === 'end' || key === 'raw' ? undefined : value;
    });
  } catch {
    return null;
  }
};

// Historical server and webpack output embedded Function#toString in the script.
// Keep these approved forms independent of how the current matcher is compiled.
const legacyValidators = [
  isValidAgentEnvironment.toString(),
  String.raw`(value) => typeof value === "object" && value !== null && !Array.isArray(value) && Object.entries(value).every(([key, entry]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && typeof entry === "string" && !entry.includes("\0"))`,
  String.raw`a=>"object"==typeof a&&null!==a&&!Array.isArray(a)&&Object.entries(a).every(([a,b])=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(a)&&"string"==typeof b&&!b.includes("\0"))`,
];
const knownSignatures = new Set(legacyValidators.map((validator) =>
  scriptSignature(CLAUDE_LAUNCHER_SCRIPT.replace(isValidAgentEnvironment.toString(), validator))));

export const isLegacyClaudeLauncher = (script: string | undefined): boolean => {
  if (!script || script.length > 65536) return false;
  const signature = scriptSignature(script);
  return signature !== null && knownSignatures.has(signature);
};
