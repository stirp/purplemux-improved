import type { NextApiRequest, NextApiResponse } from 'next';
import { loadMessagesServer } from '@/lib/load-messages';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (typeof req.query.locale !== 'string') return res.status(400).json({ error: 'Locale required' });
  return res.status(200).json(await loadMessagesServer(req.query.locale));
}
