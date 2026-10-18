import type { NextApiRequest, NextApiResponse } from 'next';
import { SessionTagError, sessionTagUpdateSchema } from '@/lib/session-tags';
import { updateSessionTags } from '@/lib/workspace-store';
import { getStatusManager } from '@/lib/status-manager';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ code: 'invalid' });
  }
  const parsed = sessionTagUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ code: 'invalid' });
  try {
    const workflow = await updateSessionTags(parsed.data, () => getStatusManager().getAllForClient());
    return res.status(200).json(workflow);
  } catch (error) {
    if (error instanceof SessionTagError) return res.status(error.status).json({ code: error.code });
    return res.status(500).json({ code: 'saveFailed' });
  }
};

export default handler;
