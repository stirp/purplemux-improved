export type TAgentEnvironment = Record<string, string>;

export const AGENT_ENVIRONMENT_KEYS = {
  claude: 'claudeEnvironment',
  codex: 'codexEnvironment',
} as const satisfies Record<'claude' | 'codex', 'claudeEnvironment' | 'codexEnvironment'>;

export const MAX_AGENT_CONFIG_BYTES = 4 * 1024 * 1024;

export const isValidAgentEnvironment = (value: unknown): value is TAgentEnvironment =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  Object.entries(value).every(([key, entry]) =>
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) &&
    typeof entry === 'string' && !entry.includes('\0'));

export const parseAgentEnvironment = (text: string): TAgentEnvironment => {
  const entries: [string, string][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const assignment = line.replace(/^\s*export[ \t]+/, '');
    const separator = assignment.indexOf('=');
    if (separator < 1) throw new Error('Expected NAME=value');
    const key = assignment.slice(0, separator).trim();
    const value = assignment.slice(separator + 1);
    if (!isValidAgentEnvironment({ [key]: value })) throw new Error('Invalid environment variable');
    if (entries.some(([name]) => name === key)) throw new Error('Duplicate environment variable');
    entries.push([key, value]);
  }
  return Object.fromEntries(entries);
};

export const formatAgentEnvironment = (env: TAgentEnvironment | null | undefined): string =>
  Object.entries(env ?? {}).map(([key, value]) => `${key}=${value}`).join('\n');
