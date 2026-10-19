export type TToolResultBlock =
  | { kind: 'raw'; text: string }
  | { kind: 'markdown'; text: string }
  | {
      kind: 'command';
      output: string;
      stderr?: string;
      exitCode?: number;
      duration?: number;
      sessionId?: string | number;
    };

export interface IToolResultPresentation {
  blocks: TToolResultBlock[];
  isError: boolean;
}

const MAX_PARSE_LENGTH = 200_000;
const MAX_DEPTH = 5;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const rawBlock = (value: unknown): TToolResultBlock => ({
  kind: 'raw',
  text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
});

const normalizeReferenceLabel = (label: string): string =>
  label.trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();

const hasReferenceDefinition = (text: string, label: string): boolean => {
  const normalized = normalizeReferenceLabel(label);
  // Definitions may wrap the label or put the destination on the next line.
  const definitions = /^ {0,3}\[((?:\\.|[^\]\\])+)\]:[ \t]*(?:\r?\n[ \t]*)?\S/gm;
  for (const match of text.matchAll(definitions)) {
    if (normalizeReferenceLabel(match[1]) === normalized) return true;
  }
  return false;
};

const startsWithMarkdownLink = (text: string): boolean => {
  let depth = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '\\') {
      index++;
    } else if (char === '[') {
      depth++;
    } else if (char === ']') {
      depth--;
      if (depth === 0) {
        return ['(', '[', ':'].includes(text[index + 1])
          || hasReferenceDefinition(text.slice(index + 1), text.slice(1, index));
      }
    }
  }
  return false;
};

const isJsonText = (text: string): boolean => {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{')) return true;
  if (!trimmed.startsWith('[')) return false;
  try {
    // JSON strings can contain Markdown links; valid JSON takes precedence.
    JSON.parse(trimmed);
    return true;
  } catch {
    return !startsWithMarkdownLink(trimmed);
  }
};

const parseText = (text: string, depth: number): IToolResultPresentation | null => {
  if (depth > MAX_DEPTH || text.length > MAX_PARSE_LENGTH || !/^[\s]*[\[{]/.test(text)) return null;
  try {
    return recognizeValue(JSON.parse(text), depth, text);
  } catch {
    return null;
  }
};

const recognizeValue = (value: unknown, depth: number, originalText?: string): IToolResultPresentation | null => {
  if (depth > MAX_DEPTH) return null;
  if (typeof value === 'string') return parseText(value, depth + 1);

  if (Array.isArray(value)) {
    const parts = value.map((item) => recognizeValue(item, depth + 1));
    if (!parts.some(Boolean)) return null;
    return {
      blocks: parts.flatMap((part, index) => part?.blocks ?? [rawBlock(value[index])]),
      isError: parts.some((part) => part?.isError),
    };
  }

  if (!isRecord(value)) return null;

  if ((value.type === 'text' || value.type === 'input_text') && typeof value.text === 'string') {
    return parseText(value.text, depth + 1) ?? {
      blocks: [{
        kind: depth >= MAX_DEPTH || value.text.length > MAX_PARSE_LENGTH || isJsonText(value.text)
          ? 'raw' : 'markdown',
        text: value.text,
      }],
      isError: false,
    };
  }

  if (value.status === 'fulfilled' && 'value' in value) {
    return recognizeValue(value.value, depth + 1);
  }

  if (Array.isArray(value.content)) {
    const content = recognizeValue(value.content, depth + 1);
    if (content) return { ...content, isError: value.isError === true || content.isError };
    if (value.isError === true) return { blocks: [rawBlock(originalText ?? value)], isError: true };
  }

  const hasOutput = typeof value.output === 'string' || typeof value.stdout === 'string' || typeof value.stderr === 'string';
  const exitCode = isNumber(value.exit_code) && Number.isInteger(value.exit_code) ? value.exit_code : undefined;
  const duration = isNumber(value.wall_time_seconds) && value.wall_time_seconds >= 0 ? value.wall_time_seconds : undefined;
  const sessionId = typeof value.session_id === 'string' || isNumber(value.session_id) ? value.session_id : undefined;
  const validFields = ['output', 'stdout', 'stderr'].every((key) => value[key] == null || typeof value[key] === 'string')
    && (value.exit_code == null || exitCode !== undefined)
    && (value.wall_time_seconds == null || duration !== undefined)
    && (value.session_id == null || sessionId !== undefined);

  if (!hasOutput || !validFields || (exitCode === undefined && duration === undefined && sessionId === undefined)) return null;
  // Avoid silently choosing one of two different stdout representations.
  if (typeof value.output === 'string' && typeof value.stdout === 'string' && value.output !== value.stdout) return null;

  return {
    blocks: [{
      kind: 'command',
      output: typeof value.output === 'string' ? value.output : typeof value.stdout === 'string' ? value.stdout : '',
      stderr: typeof value.stderr === 'string' ? value.stderr : undefined,
      exitCode,
      duration,
      sessionId,
    }],
    isError: value.isError === true || (exitCode !== undefined && exitCode !== 0),
  };
};

export const getToolResultPresentation = (output: string): IToolResultPresentation | null =>
  parseText(output, 0);
