import type { NextApiRequest, NextApiResponse } from 'next';
import { terminalKeysSchema } from '@/lib/terminal-keys';
import { getTerminalKeys, updateTerminalKeys } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (req.method === 'GET') return res.status(200).json(await getTerminalKeys());
    if (req.method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT');
      return res.status(405).json({ error: 'Method not allowed' });
    }
    const parsed = terminalKeysSchema.safeParse(req.body?.keys);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid terminal keys' });
    return res.status(200).json(await updateTerminalKeys(parsed.data));
  } catch {
    return res.status(500).json({ error: 'Unable to save terminal keys' });
  }
};

export default handler;
