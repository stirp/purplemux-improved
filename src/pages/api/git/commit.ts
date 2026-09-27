import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { getSessionCwd, hasSession } from '@/lib/tmux';
import { commitMessageSchema, commitWorkingChanges, generateCommitMessage, GitCommitError, inspectCommit } from '@/lib/git-commit';

const oid = z.string().regex(/^[a-f0-9]{40,64}$/);
const common = z.object({ session: z.string().min(1).max(200) });
const schema = z.discriminatedUnion('action', [
  common.extend({ action: z.literal('inspect') }),
  common.extend({ action: z.literal('generate'), locale: z.enum(['en', 'ko', 'ja', 'zh-CN', 'es', 'de', 'fr', 'pt-BR', 'zh-TW', 'ru', 'tr']) }),
  common.extend({ action: z.literal('commit'), snapshot: z.object({ directory: z.string().min(1).max(4096),
    branch: z.string().startsWith('refs/heads/').max(1024), head: oid.nullable(), tree: oid }), message: commitMessageSchema }),
]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'Method not allowed' }); }
  const input = schema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid commit options' });
  try {
    const data = input.data;
    if (!await hasSession(data.session)) return res.status(404).json({ error: 'Session not found' });
    const cwd = await getSessionCwd(data.session);
    if (!cwd) return res.status(404).json({ error: 'Session directory not found' });
    const result = data.action === 'inspect' ? await inspectCommit(cwd)
      : data.action === 'generate' ? await generateCommitMessage(cwd, data.locale)
        : await commitWorkingChanges(cwd, data.snapshot, data.message);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(error instanceof GitCommitError ? error.status : 500).json({
      error: error instanceof Error ? error.message : String(error),
      ...(error instanceof GitCommitError ? { code: error.code } : {}),
    });
  }
}
