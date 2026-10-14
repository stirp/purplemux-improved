import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { WORK_STATUSES } from '@/lib/session-workflow';
import { updateSessionWorkflow } from '@/lib/workspace-store';

const schema = z.union([
  z.object({
    key: z.string().regex(/^(claude|codex):[a-zA-Z0-9_:-]{1,256}$/),
    status: z.enum(WORK_STATUSES).nullable(),
  }).strict(),
  z.object({ section: z.enum(WORK_STATUSES), collapsed: z.boolean() }).strict(),
  z.object({
    key: z.string().regex(/^(claude|codex):[a-zA-Z0-9_:-]{1,256}$/),
    title: z.string().max(200),
  }).strict(),
]);

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid workflow update' });
  try {
    return res.status(200).json(await updateSessionWorkflow(parsed.data));
  } catch {
    return res.status(500).json({ error: 'Failed to save workflow' });
  }
};

export default handler;
