import type { NextApiRequest, NextApiResponse } from 'next';
import { getAppUpdateManager } from '@/lib/app-update-server';
import { assertUpdateSessionsIdle } from '@/lib/app-update-guard';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  const manager = getAppUpdateManager();
  if (!manager) return res.status(503).json({ error: 'Update service is not ready' });
  if (req.method === 'GET') return res.json(manager.getState());
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).end();
  }
  if (req.headers['x-purplemux-update'] !== '1' || !req.headers['content-type']?.startsWith('application/json')) {
    return res.status(400).json({ error: 'Invalid update request' });
  }
  if (req.body?.action === 'guard') {
    try {
      await assertUpdateSessionsIdle();
      return res.json({ idle: true });
    } catch {
      return res.status(409).json({ error: 'Tasks are running or their state is unknown. Retry when all sessions are idle.' });
    }
  }
  if (req.body?.action === 'check') await manager.check();
  else if (req.body?.action === 'install') void manager.install();
  else return res.status(400).json({ error: 'Invalid update action' });
  return res.status(202).json(manager.getState());
};

export default handler;
