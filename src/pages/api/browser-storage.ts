import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  // A custom header prevents cross-origin form submissions from clearing data.
  if (req.headers['x-purplemux-clear-storage'] !== '1') return res.status(400).json({ error: 'Confirmation required' });
  // Browser APIs clear storage explicitly; this header also requests HTTP cache
  // eviction where supported, without invalidating the authentication cookie.
  res.setHeader('Clear-Site-Data', '"cache"');
  return res.status(200).json({ ok: true });
}
