import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createReadStream } from 'fs';
import readline from 'readline';
import { callAgentText } from '@/lib/agent-text';
import { getConfig, type TNoteSummaryProvider } from '@/lib/config-store';
import { collectJsonlFiles } from './stats-cache';
import type { IDailyReportDay } from '@/types/stats';

const CACHE_DIR = path.join(os.homedir(), '.purplemux', 'stats', 'daily-reports');
const CODEX_SESSIONS_ROOT = path.join(os.homedir(), '.codex', 'sessions');

// --- Cache read/write ---

export const readAllCachedReports = async (): Promise<Record<string, IDailyReportDay>> => {
  const result: Record<string, IDailyReportDay> = {};
  try {
    const files = await fs.readdir(CACHE_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(CACHE_DIR, file), 'utf-8');
        const data = JSON.parse(content) as IDailyReportDay;
        if (data.date && data.brief) {
          result[data.date] = data;
        }
      } catch {
        // skip malformed files
      }
    }
  } catch {
    // directory doesn't exist yet
  }
  return result;
};

const writeCachedReport = async (report: IDailyReportDay): Promise<void> => {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(
    path.join(CACHE_DIR, `${report.date}.json`),
    JSON.stringify(report, null, 2),
    'utf-8',
  );
};

// --- Session data extraction ---

interface ISessionData {
  provider: TNoteSummaryProvider;
  project: string;
  start: string;
  msgCount: number;
  toolCount: number;
  firstMessage: string;
}

export const shortenCwd = (cwd: string): string => {
  const home = os.homedir();
  const rel = cwd.startsWith(home) ? cwd.slice(home.length + 1) : cwd;
  return rel
    .replace(/^Workspace\/github\.com\//g, '')
    .replace(/^Workspace\/gitlab\.kolonfnc\.com\//g, 'gitlab/')
    .replace(/^Documents\//g, 'docs/')
    .replace(/^Downloads/g, 'Downloads');
};

const extractSessionsForDate = async (targetDate: string): Promise<ISessionData[]> => {
  const files = await collectJsonlFiles();
  const sessions: ISessionData[] = [];

  for (const filePath of files) {
    const userMessages: { time: string; text: string }[] = [];
    const timestamps: string[] = [];
    let toolCount = 0;
    let cwd = '';

    try {
      const stream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as Record<string, unknown>;
          const ts = String(entry.timestamp ?? '');
          if (!ts.startsWith(targetDate)) continue;

          timestamps.push(ts);
          const type = String(entry.type ?? '');

          if (!cwd && typeof entry.cwd === 'string') {
            cwd = entry.cwd;
          }

          if (type === 'user') {
            const message = entry.message as Record<string, unknown> | undefined;
            if (!message) continue;
            const content = message.content;
            let text = '';

            if (typeof content === 'string') {
              text = content.slice(0, 300);
            } else if (Array.isArray(content)) {
              const texts: string[] = [];
              for (const c of content) {
                if (typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'text') {
                  texts.push(String((c as Record<string, unknown>).text ?? '').slice(0, 300));
                }
              }
              text = texts.join(' | ');
            }

            if (text.includes('<command-message>')) {
              const match = text.match(/<command-name>\/([^<]+)<\/command-name>/);
              text = `[Command: ${match ? match[1] : 'unknown'}]`;
            }
            if (text.includes('<local-command-caveat>') || text.includes('<task-notification>')) {
              continue;
            }
            if (text.trim()) {
              userMessages.push({ time: ts.slice(11, 16), text: text.slice(0, 200) });
            }
          }

          if (type === 'assistant') {
            const message = entry.message as Record<string, unknown> | undefined;
            if (!message) continue;
            const content = message.content as unknown[];
            if (Array.isArray(content)) {
              toolCount += content.filter(
                (c) => typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'tool_use',
              ).length;
            }
          }
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // file read error
    }

    if (timestamps.length > 0 && userMessages.length > 0) {
      const project = cwd ? shortenCwd(cwd) : path.basename(path.dirname(filePath));
      sessions.push({
        provider: 'claude',
        project,
        start: Math.min(...timestamps.map((t) => new Date(t).getTime())).toString(),
        msgCount: userMessages.length,
        toolCount,
        firstMessage: userMessages[0].text,
      });
    }
  }

  sessions.sort((a, b) => Number(a.start) - Number(b.start));
  return sessions;
};

const collectCodexJsonlFiles = async (dir = CODEX_SESSIONS_ROOT): Promise<string[]> => {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const name of names) {
    const entryPath = path.join(dir, name);
    const stat = await fs.stat(entryPath).catch(() => null);
    if (stat?.isDirectory()) {
      files.push(...await collectCodexJsonlFiles(entryPath));
    } else if (stat?.isFile() && name.endsWith('.jsonl')) {
      files.push(entryPath);
    }
  }
  return files;
};

const extractCodexSessionsForDate = async (targetDate: string): Promise<ISessionData[]> => {
  const files = await collectCodexJsonlFiles();
  const sessions: ISessionData[] = [];

  for (const filePath of files) {
    const userMessages: { time: string; text: string }[] = [];
    const timestamps: string[] = [];
    let toolCount = 0;
    let cwd = '';

    try {
      const stream = createReadStream(filePath, { encoding: 'utf-8' });
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const entry = JSON.parse(line) as {
            timestamp?: string;
            type?: string;
            payload?: {
              type?: string;
              cwd?: string;
              message?: string;
            };
          };
          const ts = String(entry.timestamp ?? '');
          if (!ts.startsWith(targetDate)) continue;
          timestamps.push(ts);

          if (entry.type === 'session_meta' && typeof entry.payload?.cwd === 'string') {
            cwd = entry.payload.cwd;
            continue;
          }

          if (entry.type === 'event_msg' && entry.payload?.type === 'user_message') {
            const text = String(entry.payload.message ?? '').trim();
            if (text && !text.startsWith('<') && !text.startsWith('# AGENTS.md')) {
              userMessages.push({ time: ts.slice(11, 16), text: text.slice(0, 200) });
            }
            continue;
          }

          if (entry.type === 'response_item') {
            const itemType = entry.payload?.type;
            if (itemType === 'function_call' || itemType === 'custom_tool_call') {
              toolCount++;
            }
          }
        } catch {
          // skip malformed lines
        }
      }
    } catch {
      // file read error
    }

    if (timestamps.length > 0 && userMessages.length > 0) {
      sessions.push({
        provider: 'codex',
        project: cwd ? shortenCwd(cwd) : path.basename(path.dirname(filePath)),
        start: Math.min(...timestamps.map((t) => new Date(t).getTime())).toString(),
        msgCount: userMessages.length,
        toolCount,
        firstMessage: userMessages[0].text,
      });
    }
  }

  return sessions;
};

const extractAllSessionsForDate = async (targetDate: string): Promise<ISessionData[]> => {
  const [claudeSessions, codexSessions] = await Promise.all([
    extractSessionsForDate(targetDate),
    extractCodexSessionsForDate(targetDate),
  ]);
  return [...claudeSessions, ...codexSessions]
    .sort((a, b) => Number(a.start) - Number(b.start));
};

// --- CLI summary generation ---

const buildPromptData = (sessions: ISessionData[]): string => {
  return sessions
    .map((s) => {
      const time = new Date(Number(s.start)).toTimeString().slice(0, 5);
      return `[${time}] [${s.provider}] [${s.project}] msgs=${s.msgCount}, tools=${s.toolCount} | ${s.firstMessage}`;
    })
    .join('\n');
};

const LOCALE_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
  'zh-CN': 'Simplified Chinese (简体中文)',
  'zh-TW': 'Traditional Chinese (繁體中文)',
  de: 'German (Deutsch)',
  es: 'Spanish (Español)',
  fr: 'French (Français)',
  'pt-BR': 'Brazilian Portuguese (Português do Brasil)',
  ru: 'Russian (Русский)',
  tr: 'Turkish (Türkçe)',
};

const resolveLanguageName = (locale: string): string =>
  LOCALE_LANGUAGE_NAMES[locale] ?? LOCALE_LANGUAGE_NAMES.en;

const SUMMARY_PROMPT = (date: string, locale: string) => {
  const languageName = resolveLanguageName(locale);
  return `Summarize the Claude and Codex session history for ${date}.

Output format (use exactly this structure):

[BRIEF]
A 2-3 line summary of the entire day. Use terse noun-form phrases. Plain text only. No markdown headings (#) or separators (---).

[DETAIL]
## Project Name
### Major Feature / Area
- One-line task summary
- One-line task summary
### Another Feature / Area
- One-line task summary

Rules:
- The [BRIEF] and [DETAIL] tags must each appear exactly once, at the start of a line.
- Do not insert meta text outside the tags (separators, numbering, explanations).
- Always include the "## Project Name" heading, even when there is only one project.
- Each item is a single line — no filenames, no code snippets.
- Use terse noun-form phrases (e.g. "Fix login logic", "Improve mobile layout"). Avoid finished-sentence / past-tense forms.
- Focus on WHAT, not HOW.
- Skip trivial chatter (greetings, one-off questions, commit commands).
- IMPORTANT: Write ALL brief and detail content in ${languageName}. Keep the [BRIEF] / [DETAIL] tags and markdown syntax (##, ###, -) as-is in English.

Data:`;
};

const stripTrailingMarkdownNoise = (text: string): string =>
  text.replace(/[\s#\-]*$/, '').trim();

const parseSummaryResponse = (response: string): { brief: string; detail: string } => {
  const briefMatch = response.match(/\[BRIEF\]\s*\n([\s\S]*?)(?=\[DETAIL\])/);
  const detailMatch = response.match(/\[DETAIL\]\s*\n([\s\S]*?)$/);

  return {
    brief: briefMatch ? stripTrailingMarkdownNoise(briefMatch[1]) : response.slice(0, 500),
    detail: detailMatch ? detailMatch[1].trim() : '',
  };
};

// --- Public API ---

export const generateDailyReport = async (
  date: string,
  force = false,
  locale = 'en',
  provider?: TNoteSummaryProvider,
): Promise<IDailyReportDay> => {
  const config = await getConfig();
  const summaryProvider = provider ?? (config.noteSummaryProvider === 'codex' ? 'codex' : 'claude');

  if (!force) {
    const existing = await readCachedReport(date);
    if (existing && existing.locale === locale && (existing.provider ?? 'claude') === summaryProvider) return existing;
  }

  const sessions = await extractAllSessionsForDate(date);
  if (sessions.length === 0) {
    const empty: IDailyReportDay = {
      date,
      brief: 'No activity recorded.',
      detail: '',
      generatedAt: new Date().toISOString(),
      locale,
      provider: summaryProvider,
    };
    await writeCachedReport(empty);
    return empty;
  }

  const promptData = buildPromptData(sessions);
  const response = await callAgentText(summaryProvider, promptData, SUMMARY_PROMPT(date, locale));
  const { brief, detail } = parseSummaryResponse(response);

  const report: IDailyReportDay = {
    date,
    brief,
    detail,
    generatedAt: new Date().toISOString(),
    locale,
    provider: summaryProvider,
  };

  await writeCachedReport(report);
  return report;
};

export const readCachedReport = async (date: string): Promise<IDailyReportDay | null> => {
  try {
    const content = await fs.readFile(path.join(CACHE_DIR, `${date}.json`), 'utf-8');
    const data = JSON.parse(content) as IDailyReportDay;
    return data.date && data.brief ? data : null;
  } catch {
    return null;
  }
};
