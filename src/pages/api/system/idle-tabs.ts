import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { idleTabPolicySchema, idleTabTargetSchema } from '@/lib/idle-tab-policy';
import { previewIdleTabs, reclaimIdleTabs, updateIdleTabPolicy } from '@/lib/idle-tab-reclaimer';

const reclaimSchema = z.object({
  targets: z.array(idleTabTargetSchema).min(1).max(100),
  policy: idleTabPolicySchema,
  confirmed: z.literal(true),
}).strict();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await previewIdleTabs());
    if (req.method === 'POST' || req.method === 'PATCH') {
      if (req.headers['sec-fetch-site'] === 'cross-site'
        || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) {
        return res.status(403).json({ error: 'Cross-site request denied' });
      }
      if (req.method === 'PATCH') {
        const parsed = idleTabPolicySchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json({ error: 'Idle timeout must be an integer between 15 and 10080 minutes' });
        return res.status(200).json(await updateIdleTabPolicy(parsed.data));
      }
      const parsed = reclaimSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid targets, policy or missing confirmation' });
      return res.status(200).json(await reclaimIdleTabs(parsed.data.targets, parsed.data.policy));
    }
    res.setHeader('Allow', 'GET, PATCH, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Idle tab operation failed' });
  }
};

export default handler;
