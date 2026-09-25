import type { NextApiRequest, NextApiResponse } from 'next';
import { listCodexSessions } from '@/lib/codex-session-list';
import { createLogger } from '@/lib/logger';
import { readHiddenSessions, sessionHistoryKey } from '@/lib/hidden-sessions';

const log = createLogger('api/codex/sessions');

const DEFAULT_DAYS_BACK = 30;
const MAX_DAYS_BACK = 365;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  const cwd = req.query.cwd as string | undefined;
  if (!cwd) {
    return res.status(400).json({ error: 'missing-param', message: 'cwd parameter required' });
  }

  const daysBackRaw = parseInt(req.query.daysBack as string, 10);
  const daysBack = Number.isFinite(daysBackRaw)
    ? Math.min(Math.max(1, daysBackRaw), MAX_DAYS_BACK)
    : DEFAULT_DAYS_BACK;

  try {
    const { sessions, scannedDirs, scannedFiles } = await listCodexSessions({ cwd, daysBack });
    const hidden = await readHiddenSessions();
    return res.status(200).json({ sessions: sessions.filter((session) => !hidden.has(sessionHistoryKey('codex', session.sessionId))), scannedDirs, scannedFiles });
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : err }, 'codex session scan failed');
    return res.status(500).json({ error: 'scan-failed', message: 'Failed to scan codex sessions' });
  }
};

export default handler;
