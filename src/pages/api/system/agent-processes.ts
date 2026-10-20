import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { scanLocalAgentProcesses } from '@/lib/local-agent-processes';
import { manageAgentProcess } from '@/lib/agent-process-manager';
import { isProcessActionRequestAllowed } from '@/lib/process-action-request';

const actionSchema = z.object({
  action: z.enum(['stop', 'adopt']),
  pid: z.number().int().positive(),
  startedAt: z.iso.datetime(),
  confirmed: z.literal(true),
}).strict();

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') return res.status(200).json(await scanLocalAgentProcesses());
    if (req.method === 'POST') {
      if (!isProcessActionRequestAllowed(req.headers)) {
        return res.status(403).json({ error: 'Cross-site request denied' });
      }
      const parsed = actionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid process action or missing confirmation' });
      return res.status(200).json(await manageAgentProcess(parsed.data.action, parsed.data));
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status((error as { status?: number }).status ?? 500).json({
      error: error instanceof Error ? error.message : 'Process action failed',
    });
  }
};

export default handler;
