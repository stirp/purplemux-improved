import type { NextApiRequest, NextApiResponse } from 'next';
import { getSystemResources } from '@/lib/system-resources';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    return res.status(200).json(await getSystemResources());
  } catch {
    return res.status(503).json({ error: 'System resources unavailable' });
  }
};

export default handler;
