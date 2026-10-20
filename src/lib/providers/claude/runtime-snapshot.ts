import fs from 'fs/promises';
import { readPendingUserQuestions } from '@/lib/pending-user-questions';
import type { IPendingUserQuestion } from '@/types/status';
import { INTERRUPT_PREFIX, summarizeToolCall } from '@/lib/session-parser';
import type { IAgentRuntimeSnapshot } from '@/lib/providers/types';
import type { ICurrentAction } from '@/types/status';
import type { TToolName } from '@/types/timeline';

const JSONL_TAIL_SIZE = 131_072;
const STALE_MS_INTERRUPTED = 20_000;
const STALE_MS_AWAITING_API = 90_000;
const MAX_JSONL_CACHE = 256;
const MAX_SNIPPET_LENGTH = 200;

interface IJsonlIdleCache {
  pendingUserQuestions: IPendingUserQuestion[];
  mtimeMs: number;
  idle: boolean;
  stale: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
  reset: boolean;
  lastEntryTs: number | null;
  interrupted: boolean;
}

interface IAssistantExtract {
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
  reset: boolean;
}

interface IScanResult {
  matched: boolean;
  idle: boolean;
  stale: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
  lastEntryTs: number | null;
  interrupted: boolean;
}

const g = globalThis as unknown as { __ptClaudeRuntimeSnapshotCache?: Map<string, IJsonlIdleCache> };
if (!g.__ptClaudeRuntimeSnapshotCache) g.__ptClaudeRuntimeSnapshotCache = new Map();
const jsonlIdleCache = g.__ptClaudeRuntimeSnapshotCache;

const emptySnapshot = (): IAgentRuntimeSnapshot => ({
  idle: false,
  stale: false,
  lastAssistantSnippet: null,
  currentAction: null,
  reset: false,
  lastEntryTs: null,
  staleMs: 0,
  interrupted: false,
});

const toCurrentAction = (block: { name?: string; input?: Record<string, unknown> }): ICurrentAction => {
  const toolName = (block.name ?? 'Tool') as TToolName;
  const input = (block.input ?? {}) as Record<string, unknown>;
  return { toolName, summary: summarizeToolCall(toolName, input) };
};

const extractAssistantInfo = (lines: string[]): IAssistantExtract => {
  let userMessageSeen = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.isSidechain) continue;

      if (entry.type === 'user') {
        const c = entry.message?.content;
        const isToolResult = Array.isArray(c) && c.some((b: unknown) => (b as { type?: string }).type === 'tool_result');
        if (!isToolResult) userMessageSeen = true;
        continue;
      }

      if (entry.type !== 'assistant' || !entry.message?.content) continue;

      if (userMessageSeen) return { lastAssistantSnippet: null, currentAction: null, reset: true };

      const content = entry.message.content;
      if (!Array.isArray(content)) continue;

      let lastAssistantSnippet: string | null = null;
      let currentAction: ICurrentAction | null = null;

      for (let j = content.length - 1; j >= 0; j--) {
        const block = content[j];
        if (block.type === 'tool_use') {
          currentAction = toCurrentAction(block);
          break;
        }
        if (block.type === 'text' && block.text?.trim()) {
          const text = block.text.trim();
          currentAction = {
            toolName: null,
            summary: text.length > MAX_SNIPPET_LENGTH ? text.slice(0, MAX_SNIPPET_LENGTH) + '…' : text,
          };
          break;
        }
      }

      for (let j = content.length - 1; j >= 0; j--) {
        if (content[j].type === 'text' && content[j].text?.trim()) {
          const text = content[j].text.trim();
          lastAssistantSnippet = text.length > MAX_SNIPPET_LENGTH
            ? text.slice(0, MAX_SNIPPET_LENGTH) + '…'
            : text;
          break;
        }
      }

      return { lastAssistantSnippet, currentAction, reset: false };
    } catch { continue; }
  }
  return { lastAssistantSnippet: null, currentAction: null, reset: false };
};

const scanLines = (lines: string[], elapsed: number): IScanResult => {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);

      if (entry.isSidechain) continue;

      const entryTs: number | null = entry.timestamp ? new Date(entry.timestamp).getTime() : null;

      if (entry.type === 'system' && (entry.subtype === 'stop_hook_summary' || entry.subtype === 'turn_duration')) {
        return { matched: true, idle: true, stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs, interrupted: false };
      }

      if (entry.type === 'assistant') {
        const stopReason = entry.message?.stop_reason;
        if (!stopReason) {
          const idle = elapsed > STALE_MS_INTERRUPTED;
          return { matched: true, idle, stale: true, needsStaleRecheck: !idle, staleMs: STALE_MS_INTERRUPTED, lastEntryTs: entryTs, interrupted: false };
        }
        return { matched: true, idle: stopReason !== 'tool_use', stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs, interrupted: false };
      }

      if (entry.type === 'user') {
        const content = entry.message?.content;
        if (Array.isArray(content) && content.length === 1 && typeof content[0]?.text === 'string' && content[0].text.startsWith(INTERRUPT_PREFIX)) {
          return { matched: true, idle: true, stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs, interrupted: true };
        }
        const idle = elapsed > STALE_MS_AWAITING_API;
        return { matched: true, idle, stale: true, needsStaleRecheck: !idle, staleMs: STALE_MS_AWAITING_API, lastEntryTs: entryTs, interrupted: false };
      }
    } catch {
      continue;
    }
  }

  return { matched: false, idle: elapsed > STALE_MS_AWAITING_API, stale: true, needsStaleRecheck: elapsed <= STALE_MS_AWAITING_API, staleMs: STALE_MS_AWAITING_API, lastEntryTs: null, interrupted: false };
};

export const readClaudeRuntimeSnapshot = async (
  jsonlPath: string,
  options: { force?: boolean } = {},
): Promise<IAgentRuntimeSnapshot> => {
  try {
    const stat = await fs.stat(jsonlPath);
    if (stat.size === 0) return { ...emptySnapshot(), idle: true, pendingUserQuestions: [] };

    const cached = jsonlIdleCache.get(jsonlPath);
    if (!options.force && cached && cached.mtimeMs === stat.mtimeMs) {
      jsonlIdleCache.delete(jsonlPath);
      jsonlIdleCache.set(jsonlPath, cached);
      if (cached.idle) return { idle: true, stale: cached.stale, lastAssistantSnippet: cached.lastAssistantSnippet, currentAction: cached.currentAction, reset: cached.reset, lastEntryTs: cached.lastEntryTs, staleMs: cached.staleMs, interrupted: cached.interrupted, pendingUserQuestions: cached.pendingUserQuestions };
      if (cached.needsStaleRecheck) {
        const idle = Date.now() - stat.mtimeMs > cached.staleMs;
        return { idle, stale: true, lastAssistantSnippet: cached.lastAssistantSnippet, currentAction: cached.currentAction, reset: cached.reset, lastEntryTs: cached.lastEntryTs, staleMs: cached.staleMs, interrupted: cached.interrupted, pendingUserQuestions: cached.pendingUserQuestions };
      }
      return { idle: false, stale: false, lastAssistantSnippet: cached.lastAssistantSnippet, currentAction: cached.currentAction, reset: cached.reset, lastEntryTs: cached.lastEntryTs, staleMs: cached.staleMs, interrupted: cached.interrupted, pendingUserQuestions: cached.pendingUserQuestions };
    }

    const handle = await fs.open(jsonlPath, 'r');
    try {
      const elapsed = Date.now() - stat.mtimeMs;

      const readSize = Math.min(stat.size, JSONL_TAIL_SIZE);
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, stat.size - readSize);
      const lines = buffer.toString('utf-8').split('\n').filter((l) => l.trim());

      const pendingUserQuestions = readPendingUserQuestions(lines, 'claude');
      const scan = scanLines(lines, elapsed);
      const extracted = extractAssistantInfo(lines);

      if (jsonlIdleCache.size >= MAX_JSONL_CACHE) {
        jsonlIdleCache.delete(jsonlIdleCache.keys().next().value!);
      }
      jsonlIdleCache.set(jsonlPath, { mtimeMs: stat.mtimeMs, idle: scan.idle, stale: scan.stale, needsStaleRecheck: scan.needsStaleRecheck, staleMs: scan.staleMs, lastAssistantSnippet: extracted.lastAssistantSnippet, currentAction: extracted.currentAction, reset: extracted.reset, lastEntryTs: scan.lastEntryTs, interrupted: scan.interrupted, pendingUserQuestions });
      return { idle: scan.idle, stale: scan.stale, lastAssistantSnippet: extracted.lastAssistantSnippet, currentAction: extracted.currentAction, reset: extracted.reset, lastEntryTs: scan.lastEntryTs, staleMs: scan.staleMs, interrupted: scan.interrupted, pendingUserQuestions };
    } finally {
      await handle.close();
    }
  } catch {
    return emptySnapshot();
  }
};

export const __testing = {
  extractAssistantInfo,
  scanLines,
};
