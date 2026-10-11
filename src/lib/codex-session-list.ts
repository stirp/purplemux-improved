import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import os from 'os';
import readline from 'readline';
import { createLogger } from '@/lib/logger';
import { readCodexSessionStats } from '@/lib/stats/jsonl-parser-codex';
import { createSessionMetaCache, type ISessionMetaCache } from '@/lib/session-meta-cache';
import { runWithConcurrency } from '@/lib/bounded-concurrency';

const log = createLogger('codex-session-list');

const SESSIONS_ROOT = path.join(os.homedir(), '.codex', 'sessions');
const DEFAULT_DAYS_BACK = 30;
const MAX_FIRST_MESSAGE_LENGTH = 200;
const MAX_LINES_FOR_FIRST_MESSAGE = 60;
const MAX_CONCURRENCY = 10;
const META_DEDUP_LOG_KEYS = new Set<string>();

export interface ICodexSessionEntry {
  sessionId: string;
  jsonlPath: string;
  startedAt: number;
  lastActivityAt: number;
  cwd: string | null;
  model: string | null;
  firstUserMessage: string | null;
  turnCount: number;
  totalTokens: number | null;
}

const g = globalThis as unknown as { __ptCodexListMetaCache?: ISessionMetaCache<ICodexSessionEntry> };
if (!g.__ptCodexListMetaCache) g.__ptCodexListMetaCache = createSessionMetaCache<ICodexSessionEntry>();
const cache = g.__ptCodexListMetaCache;

const truncateMessage = (text: string): string =>
  text.length <= MAX_FIRST_MESSAGE_LENGTH ? text : text.slice(0, MAX_FIRST_MESSAGE_LENGTH) + '…';

const warnOnce = (key: string, payload: Record<string, unknown>) => {
  if (META_DEDUP_LOG_KEYS.has(key)) return;
  META_DEDUP_LOG_KEYS.add(key);
  log.warn(payload, 'codex session meta failed');
};

interface ICodexSessionMetaPayload {
  id?: string;
  timestamp?: string;
  cwd?: string;
  model?: string;
}

interface ICodexUserMessagePayload {
  type?: string;
  message?: string;
}

const isDisplayableUserMessage = (text: string): boolean => {
  if (!text) return false;
  if (text.startsWith('<') && text.includes('environment_context')) return false;
  if (text.startsWith('<') && text.includes('user_instructions')) return false;
  return true;
};

const extractMeta = async (jsonlPath: string): Promise<ICodexSessionEntry | null> => {
  const stream = createReadStream(jsonlPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let session_id: string | null = null;
  let startedAtIso: string | null = null;
  let cwd: string | null = null;
  let model: string | null = null;
  let firstUserMessage: string | null = null;
  let turnCount = 0;
  let lineCount = 0;
  let isFirstLine = true;
  let metaParsed = false;

  try {
    for await (const line of rl) {
      lineCount++;

      if (isFirstLine) {
        isFirstLine = false;
        const trimmed = line.trim();
        if (!trimmed) continue;
        let parsed: { type?: string; payload?: ICodexSessionMetaPayload; timestamp?: string };
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          throw new Error('first-line-parse-failed');
        }
        if (parsed.type !== 'session_meta' || !parsed.payload) {
          throw new Error('first-line-not-session-meta');
        }
        const payload = parsed.payload;
        if (!payload.id) throw new Error('session-meta-missing-id');
        session_id = payload.id;
        const startedRaw = payload.timestamp ?? parsed.timestamp;
        startedAtIso = startedRaw ?? null;
        cwd = payload.cwd ?? null;
        model = payload.model ?? null;
        metaParsed = true;
        continue;
      }

      if (!line.includes('"user_message"')) continue;
      try {
        const parsed = JSON.parse(line) as { type?: string; payload?: ICodexUserMessagePayload };
        if (parsed.type !== 'event_msg') continue;
        const payload = parsed.payload;
        if (!payload || payload.type !== 'user_message') continue;
        const text = typeof payload.message === 'string' ? payload.message.trim() : '';
        if (!isDisplayableUserMessage(text)) continue;
        turnCount++;
        if (!firstUserMessage && lineCount <= MAX_LINES_FOR_FIRST_MESSAGE) {
          firstUserMessage = truncateMessage(text);
        }
      } catch {}
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  if (!metaParsed || !session_id) return null;

  const startedAt = startedAtIso ? new Date(startedAtIso).getTime() : 0;
  if (!Number.isFinite(startedAt) || startedAt <= 0) return null;

  return {
    sessionId: session_id,
    jsonlPath,
    startedAt,
    lastActivityAt: startedAt,
    cwd,
    model,
    firstUserMessage,
    turnCount,
    totalTokens: null,
  };
};

const getCachedEntry = async (jsonlPath: string): Promise<ICodexSessionEntry | null> => {
  try {
    const entry = await cache.read(jsonlPath, async (stat) => {
      const entry = await extractMeta(jsonlPath);
      return entry ? { ...entry, lastActivityAt: stat.mtimeMs } : null;
    });
    if (!entry) return null;
    const stats = await readCodexSessionStats(jsonlPath).catch(() => null);
    return {
      ...entry,
      model: entry.model ?? stats?.model ?? null,
      totalTokens: stats && stats.totalTokens > 0 ? stats.totalTokens : null,
    };
  } catch (err) {
    warnOnce(`parse:${jsonlPath}`, { jsonlPath, err: err instanceof Error ? err.message : err });
    return null;
  }
};

const dayDirPath = (date: Date): string =>
  path.join(
    SESSIONS_ROOT,
    String(date.getFullYear()),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  );

interface IListCodexSessionsOptions {
  cwd: string;
  daysBack?: number;
}

interface IListCodexSessionsResult {
  sessions: ICodexSessionEntry[];
  scannedDirs: number;
  scannedFiles: number;
}

export const listCodexSessions = async ({
  cwd,
  daysBack = DEFAULT_DAYS_BACK,
}: IListCodexSessionsOptions): Promise<IListCodexSessionsResult> => {
  const sessions: ICodexSessionEntry[] = [];
  const today = new Date();
  let scannedDirs = 0;
  let scannedFiles = 0;

  const dayPaths: string[] = [];
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    dayPaths.push(dayDirPath(date));
  }

  const dirEntries: { dir: string; files: string[] }[] = [];
  for (const dir of dayPaths) {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    scannedDirs++;
    const jsonlFiles = names.filter((n) => n.endsWith('.jsonl'));
    if (jsonlFiles.length === 0) continue;
    dirEntries.push({ dir, files: jsonlFiles });
  }

  const allTasks: (() => Promise<ICodexSessionEntry | null>)[] = [];
  for (const { dir, files } of dirEntries) {
    for (const file of files) {
      scannedFiles++;
      allTasks.push(() => getCachedEntry(path.join(dir, file)));
    }
  }

  const results = await runWithConcurrency(allTasks, MAX_CONCURRENCY);
  for (const result of results) {
    if (result.status !== 'fulfilled' || !result.value) continue;
    const entry = result.value;
    if (entry.cwd !== cwd) continue;
    sessions.push(entry);
  }

  sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return { sessions, scannedDirs, scannedFiles };
};

export const clearCodexSessionListCache = (): void => {
  cache.clear();
};
