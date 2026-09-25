import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { hideSession } from '@/lib/hidden-sessions';
import { deleteOriginalSession, SessionInUseError } from '@/lib/delete-session';
import { removeSessionHistory } from '@/lib/session-history';
import { getStatusManager } from '@/lib/status-manager';

const schema = z.object({
  provider: z.enum(['claude', 'codex']),
  sessionId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/).nullable(),
  historyEntryId: z.string().min(1).max(128).optional(),
  deleteOriginal: z.boolean().default(false),
}).refine((value) => value.sessionId !== null || (!!value.historyEntryId && !value.deleteOriginal));

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const result = schema.safeParse(req.body);
  if (!result.success) return res.status(400).json({ error: 'Invalid session' });
  try {
    const { provider, sessionId, historyEntryId, deleteOriginal } = result.data;
    if (sessionId) {
      if (deleteOriginal) await deleteOriginalSession(provider, sessionId);
      await hideSession(provider, sessionId);
    }
    const entries = await removeSessionHistory(provider, sessionId, historyEntryId);
    getStatusManager().broadcast({ type: 'session-history:sync', entries });
    return res.status(204).end();
  } catch (error) {
    if (error instanceof SessionInUseError) return res.status(409).json({ error: 'session-in-use' });
    return res.status(500).json({ error: 'Failed to remove session from history' });
  }
};

export default handler;
