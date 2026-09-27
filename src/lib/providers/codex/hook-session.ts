import { findCodexSessionById, readCodexSessionMeta } from '@/lib/providers/codex/session-detection';
import type { ICodexHookPayload } from '@/lib/providers/codex/hook-payload';

export const isRootCodexHook = async (payload: ICodexHookPayload): Promise<boolean> => {
  if (typeof payload.session_id !== 'string' || !payload.session_id) return false;
  const meta = typeof payload.transcript_path === 'string' && payload.transcript_path
    ? await readCodexSessionMeta(payload.transcript_path)
    : await findCodexSessionById(payload.session_id);
  return !!meta && meta.sessionId === payload.session_id && !meta.isSubagent;
};
