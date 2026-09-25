import type { NextApiRequest, NextApiResponse } from 'next';
import { buildCodexRuntimeArgs } from '@/lib/providers/codex';
import { getActiveWorkspaceId } from '@/lib/workspace-store';
import { createLogger } from '@/lib/logger';
import { getConfig } from '@/lib/config-store';

const log = createLogger('codex-launch-args');

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body as { workspaceId?: unknown; resumeSessionId?: unknown } | undefined;
  const workspaceId = stringOrNull(body?.workspaceId) ?? await getActiveWorkspaceId();
  const resumeSessionId = stringOrNull(body?.resumeSessionId) ?? undefined;

  try {
    const args = await buildCodexRuntimeArgs(workspaceId ?? undefined, resumeSessionId);
    const { codexEnvironment = {} } = await getConfig();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ args, env: codexEnvironment });
  } catch (err) {
    log.error(`codex launch args build failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to build Codex launch args' });
  }
};

export default handler;
