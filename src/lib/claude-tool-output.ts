import type { ITimelineToolResult } from '@/types/timeline';

export const MAX_CLAUDE_OUTPUT_LENGTH = 64 * 1024;
const MAX_DEPTH = 32;
const MAX_NODES = 2048;
const OMITTED = '[omitted]';

const prefix = (text: string, length: number): string => {
  const end = Math.min(length, text.length);
  const last = text.charCodeAt(end - 1);
  const next = text.charCodeAt(end);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff ? end - 1 : end);
};

/** Build a bounded preview before any JSON serialization or transport. */
export const getClaudeToolOutput = (content: unknown): Pick<ITimelineToolResult, 'output' | 'outputFormat' | 'outputTruncated'> => {
  if (content === undefined) return {};
  if (typeof content === 'string') {
    return {
      output: prefix(content, MAX_CLAUDE_OUTPUT_LENGTH),
      outputFormat: 'text',
      ...(content.length > MAX_CLAUDE_OUTPUT_LENGTH && { outputTruncated: true }),
    };
  }

  let remaining = MAX_CLAUDE_OUTPUT_LENGTH;
  let nodes = 0;
  let truncated = false;
  const omit = () => { truncated = true; return OMITTED; };
  const visit = (value: unknown, depth: number): unknown => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH || remaining <= 0) return omit();
    if (typeof value === 'string') {
      const text = prefix(value, remaining);
      remaining -= text.length;
      if (text.length < value.length) truncated = true;
      return text;
    }
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) {
      const result: unknown[] = [];
      for (const item of value) {
        if (nodes >= MAX_NODES || remaining <= 0) { result.push(omit()); break; }
        result.push(visit(item, depth + 1));
      }
      return result;
    }
    const record = value as Record<string, unknown>;
    const result: Record<string, unknown> = Object.create(null);
    for (const key in record) {
      if (!Object.hasOwn(record, key)) continue;
      if (nodes >= MAX_NODES || key.length >= remaining) { truncated = true; break; }
      remaining -= key.length;
      const binary = typeof record[key] === 'string' && (key === 'blob' ||
        (key === 'data' && typeof record.type === 'string' && ['base64', 'image', 'audio', 'document'].includes(record.type)));
      result[key] = binary ? omit() : visit(record[key], depth + 1);
    }
    return result;
  };
  const serialized = JSON.stringify(visit(content, 0));
  const oversized = serialized.length > MAX_CLAUDE_OUTPUT_LENGTH;
  return {
    output: prefix(serialized, MAX_CLAUDE_OUTPUT_LENGTH),
    outputFormat: oversized ? 'text' : 'json',
    ...((truncated || oversized) && { outputTruncated: true }),
  };
};
