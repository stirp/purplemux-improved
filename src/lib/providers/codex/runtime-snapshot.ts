import fs from 'fs/promises';
import type { IAgentRuntimeSnapshot } from '@/lib/providers/types';
import type { ICurrentAction } from '@/types/status';
import type { TToolName } from '@/types/timeline';

const JSONL_TAIL_SIZE = 131_072;
const STALE_MS_INTERRUPTED = 20_000;
const STALE_MS_AWAITING_API = 90_000;
const MAX_SNIPPET_LENGTH = 200;
const MAX_JSONL_CACHE = 256;

interface ICodexRuntimeCacheEntry extends IAgentRuntimeSnapshot {
  mtimeMs: number;
  needsStaleRecheck: boolean;
}

interface ICodexScanState {
  currentAction: ICurrentAction | null;
  lastAssistantSnippet: string | null;
  reset: boolean;
  lastEntryTs: number | null;
  interrupted: boolean;
  terminalIdle: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
}

const g = globalThis as unknown as { __ptCodexRuntimeSnapshotCache?: Map<string, ICodexRuntimeCacheEntry> };
if (!g.__ptCodexRuntimeSnapshotCache) g.__ptCodexRuntimeSnapshotCache = new Map();
const cache = g.__ptCodexRuntimeSnapshotCache;

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

const compact = (text: string, limit = MAX_SNIPPET_LENGTH): string => {
  const trimmed = text.replace(/\s+/g, ' ').trim();
  return trimmed.length > limit ? trimmed.slice(0, limit) + '…' : trimmed;
};

const safeString = (value: unknown): string =>
  typeof value === 'string' ? value : '';

const tryParseJson = (raw: string): unknown | null => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const summarizeFunctionCall = (name: string, args: unknown): string => {
  if (name === 'exec_command' || name === 'shell' || name === 'bash') {
    const obj = typeof args === 'object' && args !== null ? args as Record<string, unknown> : {};
    const cmd = safeString(obj.cmd ?? obj.command).split('\n')[0];
    return cmd ? `$ ${cmd}` : '$ ';
  }
  if (name === 'write_stdin') return 'Write stdin';
  if (name === 'apply_patch') return 'Apply patch';
  if (typeof args !== 'object' || args === null) return name;
  const obj = args as Record<string, unknown>;
  const firstKey = Object.keys(obj)[0];
  if (!firstKey) return name;
  const preview = typeof obj[firstKey] === 'string' ? obj[firstKey] : JSON.stringify(obj[firstKey]);
  return `${name} ${compact(String(preview), 60)}`;
};

const functionCallAction = (name: string, argsRaw: unknown): ICurrentAction => {
  const args = typeof argsRaw === 'string' ? tryParseJson(argsRaw) ?? argsRaw : argsRaw;
  const toolName: TToolName =
    name === 'exec_command' || name === 'shell' || name === 'bash'
      ? 'Bash'
      : name === 'apply_patch'
        ? 'Edit'
        : name;
  return { toolName, summary: summarizeFunctionCall(name, args) };
};

const commandAction = (payload: Record<string, unknown>): ICurrentAction => {
  const raw = payload.command;
  const command = typeof raw === 'string'
    ? raw
    : Array.isArray(raw)
      ? raw.filter((s): s is string => typeof s === 'string').join(' ')
      : '';
  return { toolName: 'Bash', summary: command ? `$ ${command.split('\n')[0]}` : '$ ' };
};

const isCompletionEvent = (type: string): boolean =>
  type === 'task_complete'
  || type === 'TurnComplete'
  || type === 'shutdown_complete'
  || type === 'ShutdownComplete';

const isInterruptEvent = (type: string): boolean =>
  type === 'turn_aborted' || type === 'TurnAborted';

const scanCodexLines = (lines: string[], elapsed: number): IAgentRuntimeSnapshot & { needsStaleRecheck: boolean } => {
  const state: ICodexScanState = {
    currentAction: null,
    lastAssistantSnippet: null,
    reset: false,
    lastEntryTs: null,
    interrupted: false,
    terminalIdle: false,
    needsStaleRecheck: false,
    staleMs: 0,
  };
  const completedCalls = new Set<string>();
  let workStateEvent: IAgentRuntimeSnapshot['workStateEvent'];
  let sawLifecycle = false;
  let pastTurnStart = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = tryParseJson(lines[i]);
    if (typeof parsed !== 'object' || parsed === null) continue;
    const item = parsed as { timestamp?: string; type?: string; payload?: Record<string, unknown> };
    const timestamp = item.timestamp ? Date.parse(item.timestamp) : NaN;
    if (Number.isFinite(timestamp) && state.lastEntryTs === null) {
      state.lastEntryTs = timestamp;
    }
    const payload = typeof item.payload === 'object' && item.payload !== null ? item.payload : {};

    if (item.type === 'event_msg') {
      const eventType = safeString(payload.type);
      const turnItem = payload.item as { type?: string } | undefined;
      const startsTurn = eventType === 'task_started' || eventType === 'TurnStarted'
        || eventType === 'user_message' || eventType === 'entered_review_mode'
        || eventType === 'EnteredReviewMode'
        || (eventType === 'item_completed' && turnItem?.type === 'EnteredReviewMode');
      const completesTurn = isCompletionEvent(eventType);
      const interruptsTurn = isInterruptEvent(eventType);
      // Review forwards child starts but completes with the outer turn ID.
      // Use the newest lifecycle record in this transcript, not ID equality.
      if (!sawLifecycle && (startsTurn || completesTurn || interruptsTurn)) {
        sawLifecycle = true;
        if (Number.isFinite(timestamp)) {
          workStateEvent = { name: startsTurn ? 'prompt-submit' : interruptsTurn ? 'interrupt' : 'stop', at: timestamp };
        }
        state.terminalIdle = completesTurn || interruptsTurn;
        state.interrupted = interruptsTurn;
      }
      if (startsTurn && eventType !== 'user_message') {
        pastTurnStart = true;
        continue;
      }
      if (completesTurn || interruptsTurn) {
        continue;
      }
      if (eventType === 'user_message') {
        if (!pastTurnStart && !state.lastAssistantSnippet && !state.currentAction) state.reset = true;
        if (!pastTurnStart && !state.terminalIdle) {
          state.needsStaleRecheck = elapsed <= STALE_MS_AWAITING_API;
          state.staleMs = STALE_MS_AWAITING_API;
        }
        pastTurnStart = true;
        continue;
      }
      if (eventType === 'agent_message') {
        const message = safeString(payload.message);
        if (message && !state.lastAssistantSnippet) {
          state.lastAssistantSnippet = compact(message);
        }
        if (!pastTurnStart && !state.reset && !state.terminalIdle && !state.currentAction && message) {
          state.currentAction = { toolName: null, summary: compact(message) };
        }
        if (!pastTurnStart && !state.terminalIdle) {
          state.needsStaleRecheck = elapsed <= STALE_MS_INTERRUPTED;
          state.staleMs = STALE_MS_INTERRUPTED;
        }
        continue;
      }
      if ((eventType === 'exec_command_end' || eventType === 'ExecCommandEnd') && payload.call_id) {
        completedCalls.add(String(payload.call_id));
        continue;
      }
      if ((eventType === 'exec_command_begin' || eventType === 'ExecCommandBegin') && payload.call_id) {
        const callId = String(payload.call_id);
        if (!pastTurnStart && !state.reset && !state.terminalIdle && !completedCalls.has(callId) && !state.currentAction) {
          state.currentAction = commandAction(payload);
          state.needsStaleRecheck = false;
          state.staleMs = 0;
        }
      }
      continue;
    }

    if (item.type === 'response_item') {
      const responseType = safeString(payload.type);
      const callId = safeString(payload.call_id);
      if ((responseType === 'function_call_output' || responseType === 'custom_tool_call_output') && callId) {
        completedCalls.add(callId);
        continue;
      }
      if (responseType === 'function_call' || responseType === 'custom_tool_call') {
        const name = safeString(payload.name);
        if (callId && completedCalls.has(callId)) continue;
        if (!pastTurnStart && !state.reset && !state.terminalIdle && name && !state.currentAction) {
          state.currentAction = functionCallAction(name, payload.arguments ?? payload.input);
        }
        continue;
      }
      if (responseType === 'web_search_call') {
        const status = safeString(payload.status);
        if (!pastTurnStart && !state.reset && !state.terminalIdle && status !== 'completed' && status !== 'failed' && !state.currentAction) {
          state.currentAction = {
            toolName: 'WebSearch',
            summary: safeString(payload.query) ? `WebSearch "${safeString(payload.query)}"` : 'WebSearch',
          };
        }
      }
    }
  }

  const stale = !state.terminalIdle && state.needsStaleRecheck;
  const idle = state.terminalIdle || (state.needsStaleRecheck && elapsed > state.staleMs);
  return {
    idle,
    stale,
    lastAssistantSnippet: state.lastAssistantSnippet,
    currentAction: state.currentAction,
    reset: state.reset,
    lastEntryTs: state.lastEntryTs,
    staleMs: state.staleMs,
    interrupted: state.interrupted,
    workStateEvent,
    needsStaleRecheck: state.needsStaleRecheck,
  };
};

const readTailLines = async (jsonlPath: string, fileSize: number): Promise<string[]> => {
  const readSize = Math.min(fileSize, JSONL_TAIL_SIZE);
  const handle = await fs.open(jsonlPath, 'r');
  try {
    const buffer = Buffer.alloc(readSize);
    const { bytesRead } = await handle.read(buffer, 0, readSize, fileSize - readSize);
    const lines = buffer.subarray(0, bytesRead).toString('utf-8').split('\n');
    if (fileSize > readSize && lines.length > 0) lines.shift();
    return lines.filter((line) => line.trim());
  } finally {
    await handle.close();
  }
};

export const readCodexRuntimeSnapshot = async (
  jsonlPath: string,
  options: { force?: boolean } = {},
): Promise<IAgentRuntimeSnapshot> => {
  try {
    const stat = await fs.stat(jsonlPath);
    if (stat.size === 0) return { ...emptySnapshot(), idle: true };

    const cached = cache.get(jsonlPath);
    if (!options.force && cached && cached.mtimeMs === stat.mtimeMs) {
      cache.delete(jsonlPath);
      cache.set(jsonlPath, cached);
      if (!cached.needsStaleRecheck) return cached;
      const idle = Date.now() - stat.mtimeMs > cached.staleMs;
      return { ...cached, idle, stale: !idle };
    }

    const lines = await readTailLines(jsonlPath, stat.size);
    const snapshot = scanCodexLines(lines, Date.now() - stat.mtimeMs);
    if (cache.size >= MAX_JSONL_CACHE) {
      cache.delete(cache.keys().next().value!);
    }
    cache.set(jsonlPath, { ...snapshot, mtimeMs: stat.mtimeMs });
    const { needsStaleRecheck: _needsStaleRecheck, ...publicSnapshot } = snapshot;
    return publicSnapshot;
  } catch {
    return emptySnapshot();
  }
};

export const __testing = {
  scanCodexLines,
};
