import type { NextApiRequest, NextApiResponse } from 'next';
import { tmpdir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { verifyRequestSession } from '@/lib/auth';
import { verifyCliToken } from '@/lib/cli-token';
import { getWorkspaces } from '@/lib/workspace-store';
import { createLogger } from '@/lib/logger';
import {
  getSessionFileCsp, getSessionFileType, MAX_TEXT_PREVIEW_BYTES, openSessionFile,
  renderSessionFileText, SessionFileError,
} from '@/lib/session-files';

const log = createLogger('session-files');

export const config = { api: { responseLimit: false } };

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!verifyCliToken(req) && !(await verifyRequestSession(req.headers.cookie))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let file: Awaited<ReturnType<typeof openSessionFile>> | undefined;
  try {
    const { workspaces } = await getWorkspaces();
    file = await openSessionFile(req.query.path, [...workspaces.flatMap((workspace) => workspace.directories), tmpdir()]);
    const type = getSessionFileType(file.name);
    if (type.text && req.query.view === '1') {
      if (file.size > MAX_TEXT_PREVIEW_BYTES) throw new SessionFileError(413, 'File is too large to preview');
      // Bound the read even when a running agent grows the file after stat().
      const buffer = Buffer.alloc(Math.min(file.size + 1, MAX_TEXT_PREVIEW_BYTES + 1));
      const { bytesRead } = await file.handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead > MAX_TEXT_PREVIEW_BYTES) throw new SessionFileError(413, 'File is too large to preview');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      return res.status(200).send(renderSessionFileText(file.name, buffer.subarray(0, bytesRead).toString('utf8')));
    }
    res.setHeader('Content-Type', type.mime);
    const disposition = type.download ? 'attachment' : 'inline';
    const filename = encodeURIComponent(file.name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${filename}`);
    if (type.active) res.setHeader('Content-Security-Policy', getSessionFileCsp(req.headers.host ?? 'localhost'));
    await pipeline(file.handle.createReadStream({ autoClose: false }), res);
  } catch (error) {
    if (res.headersSent || res.destroyed) {
      res.destroy();
      return;
    }
    if (error instanceof SessionFileError) return res.status(error.status).json({ error: error.message });
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return res.status(404).json({ error: 'File not found' });
    if (code === 'EACCES' || code === 'EPERM' || code === 'ELOOP') return res.status(403).json({ error: 'Path not allowed' });
    log.error({ error }, 'Failed to serve session file');
    return res.status(500).json({ error: 'Failed to read file' });
  } finally {
    await file?.handle.close();
  }
};

export default handler;
