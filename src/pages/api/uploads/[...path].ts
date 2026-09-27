import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { pipeline } from 'stream/promises';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getImageMimeForPath, resolveUploadImagePath } from '@/lib/uploads-store';
import { verifyRequestSession } from '@/lib/auth';
import { verifyCliToken } from '@/lib/cli-token';
import { createLogger } from '@/lib/logger';

const log = createLogger('uploads');

export const config = {
  api: {
    responseLimit: false,
  },
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyCliToken(req) && !(await verifyRequestSession(req.headers.cookie))) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const parts = Array.isArray(req.query.path)
    ? req.query.path
    : typeof req.query.path === 'string'
      ? [req.query.path]
      : [];
  const filePath = resolveUploadImagePath(parts);
  if (!filePath) return res.status(403).json({ error: 'Path not allowed' });

  const mime = getImageMimeForPath(filePath);
  if (!mime) return res.status(415).json({ error: 'Unsupported image type' });

  try {
    const info = await stat(filePath);
    if (!info.isFile()) return res.status(404).json({ error: 'Not found' });

    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', String(info.size));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    await pipeline(createReadStream(filePath), res);
  } catch (err) {
    const code = typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : '';
    if (code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    log.error(`serve upload failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to serve upload' });
  }
};

export default handler;
