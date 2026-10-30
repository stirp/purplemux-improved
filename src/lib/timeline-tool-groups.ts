import { diffLines } from 'diff';
import type {
  ITimelineEntry, ITimelineExecCommandStream, ITimelineMcpToolCall, ITimelinePatchApply,
  ITimelineToolCall, ITimelineToolResult, ITimelineWebSearch,
} from '@/types/timeline';

type TGroupedItem =
  | { type: 'entry'; id: string; entry: ITimelineEntry }
  | { type: 'tool-group'; id: string; toolCalls: ITimelineToolCall[]; toolResults: ITimelineToolResult[] };

type TAdaptedToolGroupEntry = {
  calls: ITimelineToolCall[];
  results: ITimelineToolResult[];
};

// Timeline updates replace entries; weak keys release derived data with the display snapshots.
const adaptedEntries = new WeakMap<ITimelineEntry, TAdaptedToolGroupEntry | null>();
const groupedEntries = new WeakMap<ITimelineEntry[], TGroupedItem[]>();

const summarizeToolOutput = (output: string): string => {
  const trimmed = output.trim();
  if (!trimmed) return '';
  const lines = trimmed.split('\n');
  return lines.length > 1 ? `${lines.length} lines` : trimmed.slice(0, 100);
};

const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

const toAdaptedToolGroupEntry = (
  call: ITimelineToolCall,
  result?: ITimelineToolResult,
): TAdaptedToolGroupEntry => ({
  calls: [call],
  results: result ? [result] : [],
});

const adaptExecCommandToToolGroup = (
  entry: ITimelineExecCommandStream,
): TAdaptedToolGroupEntry => {
  const command = entry.parsedCommand ?? entry.command;
  const outputSummary = summarizeToolOutput(entry.status === 'error' ? entry.stderr || entry.stdout : entry.stdout);
  const lineCountMatch = outputSummary.match(/^(\d+) lines$/);
  const summary = entry.status === 'success' && lineCountMatch
    ? `$ ${command} → ${lineCountMatch[1]} lines`
    : `$ ${command}`;

  return toAdaptedToolGroupEntry(
    {
      id: entry.id,
      type: 'tool-call',
      timestamp: entry.timestamp,
      toolUseId: entry.callId,
      toolName: 'Bash',
      summary,
      status: entry.status,
    },
    outputSummary && !lineCountMatch
      ? {
          id: `${entry.id}:result`,
          type: 'tool-result',
          timestamp: entry.timestamp,
          toolUseId: entry.callId,
          isError: entry.status === 'error',
          summary: outputSummary,
        }
      : undefined,
  );
};

const adaptWebSearchToToolGroup = (
  entry: ITimelineWebSearch,
): TAdaptedToolGroupEntry => {
  const resultSummary = entry.resultsSummary
    ?? (entry.resultCount != null ? `${entry.resultCount} results` : '');

  return toAdaptedToolGroupEntry(
    {
      id: entry.id,
      type: 'tool-call',
      timestamp: entry.timestamp,
      toolUseId: entry.callId,
      toolName: 'WebSearch',
      summary: entry.query ? `WebSearch "${entry.query}"` : 'WebSearch',
      status: entry.status,
    },
    resultSummary
      ? {
          id: `${entry.id}:result`,
          type: 'tool-result',
          timestamp: entry.timestamp,
          toolUseId: entry.callId,
          isError: entry.status === 'error',
          summary: resultSummary,
        }
      : undefined,
  );
};

const adaptMcpToolToToolGroup = (
  entry: ITimelineMcpToolCall,
): TAdaptedToolGroupEntry => toAdaptedToolGroupEntry(
  {
    id: entry.id,
    type: 'tool-call',
    timestamp: entry.timestamp,
    toolUseId: entry.callId,
    toolName: 'MCP',
    summary: `MCP ${entry.server || '?'}/${entry.tool || '?'}`,
    status: entry.status,
  },
  entry.resultSummary
    ? {
        id: `${entry.id}:result`,
        type: 'tool-result',
        timestamp: entry.timestamp,
        toolUseId: entry.callId,
        isError: entry.status === 'error',
        summary: entry.resultSummary,
      }
    : undefined,
);

interface IParsedPatchDiff {
  filePath: string;
  status: string;
  oldString: string;
  newString: string;
  added: number;
  removed: number;
}

const PATCH_FILE_HEADER_RE = /^\*\*\*\s+(Add|Update|Delete)\s+File:\s+(.+?)\s*$/i;
const PATCH_MOVE_TO_RE = /^\*\*\*\s+Move to:\s+(.+?)\s*$/i;

const countDiffLines = (oldStr: string, newStr: string): { added: number; removed: number } => {
  let added = 0;
  let removed = 0;
  for (const change of diffLines(oldStr, newStr)) {
    const count = change.count ?? 0;
    if (change.added) added += count;
    else if (change.removed) removed += count;
  }
  return { added, removed };
};

const parsePatchDiffs = (diff?: string): IParsedPatchDiff[] => {
  if (!diff) return [];

  const parsed: Array<{
    filePath: string;
    status: string;
    oldLines: string[];
    newLines: string[];
    added: number;
    removed: number;
  }> = [];
  let current: (typeof parsed)[number] | null = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.oldLines.length > 0 || current.newLines.length > 0 || current.added > 0 || current.removed > 0) {
      parsed.push(current);
    }
    current = null;
  };

  for (const line of diff.split('\n')) {
    const header = line.match(PATCH_FILE_HEADER_RE);
    if (header) {
      pushCurrent();
      current = {
        status: header[1].toLowerCase(),
        filePath: header[2],
        oldLines: [],
        newLines: [],
        added: 0,
        removed: 0,
      };
      continue;
    }

    if (!current) continue;

    const moveTo = line.match(PATCH_MOVE_TO_RE);
    if (moveTo) {
      current.filePath = moveTo[1];
      continue;
    }

    if (line.startsWith('@@') || line.startsWith('***')) continue;

    const marker = line[0];
    const value = line.slice(1);
    if (marker === '+') {
      current.newLines.push(value);
      current.added += 1;
    } else if (marker === '-') {
      current.oldLines.push(value);
      current.removed += 1;
    } else if (marker === ' ') {
      current.oldLines.push(value);
      current.newLines.push(value);
    }
  }

  pushCurrent();

  return parsed.map((item) => {
    const oldString = item.oldLines.join('\n');
    const newString = item.newLines.join('\n');
    const { added, removed } = countDiffLines(oldString, newString);
    return {
      filePath: item.filePath,
      status: item.status,
      oldString,
      newString,
      added,
      removed,
    };
  });
};

const patchVerbForStatus = (status: string): string => {
  const s = status.toLowerCase();
  if (s.includes('add') || s.includes('create')) return 'Create';
  if (s.includes('delete') || s.includes('remove')) return 'Delete';
  return 'Update';
};

const adaptPatchApplyToToolGroup = (
  entry: ITimelinePatchApply,
): TAdaptedToolGroupEntry | null => {
  const patchDiffs = parsePatchDiffs(entry.diff);
  if (patchDiffs.length > 0) {
    return {
      calls: patchDiffs.map((patchDiff, idx) => ({
        id: `${entry.id}:${idx}`,
        type: 'tool-call',
        timestamp: entry.timestamp,
        toolUseId: `${entry.callId}:${idx}`,
        toolName: 'Edit',
        summary: `${patchVerbForStatus(patchDiff.status)} ${patchDiff.filePath} (+${patchDiff.added}, -${patchDiff.removed})`,
        filePath: patchDiff.filePath,
        diff: {
          filePath: patchDiff.filePath,
          oldString: patchDiff.oldString,
          newString: patchDiff.newString,
        },
        status: entry.status,
      })),
      results: [],
    };
  }

  const fileCount = entry.files.length;
  if (fileCount === 0 && entry.status === 'success') return { calls: [], results: [] };

  const fileLabel = fileCount === 0
    ? 'files'
    : fileCount === 1
      ? entry.files[0].path
      : pluralize(fileCount, 'file', 'files');

  return toAdaptedToolGroupEntry({
    id: entry.id,
    type: 'tool-call',
    timestamp: entry.timestamp,
    toolUseId: entry.callId,
    toolName: 'Edit',
    summary: `Patch ${fileLabel}`,
    status: entry.status,
  });
};

const adaptToToolGroupEntry = (
  entry: ITimelineEntry,
): TAdaptedToolGroupEntry | null => {
  switch (entry.type) {
    case 'exec-command-stream':
      return adaptExecCommandToToolGroup(entry);
    case 'web-search':
      return adaptWebSearchToToolGroup(entry);
    case 'mcp-tool-call':
      return adaptMcpToolToToolGroup(entry);
    case 'patch-apply':
      return adaptPatchApplyToToolGroup(entry);
    default:
      return null;
  }
};

const getAdaptedToolGroupEntry = (entry: ITimelineEntry): TAdaptedToolGroupEntry | null => {
  if (adaptedEntries.has(entry)) return adaptedEntries.get(entry)!;
  const adapted = adaptToToolGroupEntry(entry);
  adaptedEntries.set(entry, adapted);
  return adapted;
};

export const groupTimelineEntries = (entries: ITimelineEntry[]): TGroupedItem[] => {
  const cached = groupedEntries.get(entries);
  if (cached) return cached;
  const result: TGroupedItem[] = [];
  let toolCallBuffer: ITimelineToolCall[] = [];
  let toolResultBuffer: ITimelineToolResult[] = [];

  const flushToolBuffer = () => {
    if (toolCallBuffer.length > 0) {
      result.push({
        type: 'tool-group',
        id: toolCallBuffer[0].id,
        toolCalls: [...toolCallBuffer],
        toolResults: [...toolResultBuffer],
      });
      toolCallBuffer = [];
      toolResultBuffer = [];
    }
  };

  for (const entry of entries) {
    if (entry.type === 'tool-call') {
      toolCallBuffer.push(entry);
    } else if (entry.type === 'tool-result') {
      toolResultBuffer.push(entry);
    } else {
      const adapted = getAdaptedToolGroupEntry(entry);
      if (adapted) {
        toolCallBuffer.push(...adapted.calls);
        toolResultBuffer.push(...adapted.results);
        continue;
      }
      flushToolBuffer();
      result.push({ type: 'entry', id: entry.id, entry });
    }
  }

  flushToolBuffer();
  groupedEntries.set(entries, result);
  return result;
};

