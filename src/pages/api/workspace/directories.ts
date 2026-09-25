import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const requested = req.query.directory;
  if (requested !== undefined && typeof requested !== 'string') {
    return res.status(400).json({ error: 'Invalid directory' });
  }
  const directory = requested || os.homedir();
  if (!path.isAbsolute(directory)) {
    return res.status(400).json({ error: 'Directory must be absolute' });
  }
  try {
    const current = path.resolve(directory);
    const entries = await fs.readdir(current, { withFileTypes: true });
    const directories = [];
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const isDirectory = entry.isDirectory() || (entry.isSymbolicLink() &&
        await fs.stat(entryPath).then((stat) => stat.isDirectory()).catch(() => false));
      if (isDirectory) directories.push({ name: entry.name, path: entryPath, hidden: entry.name.startsWith('.') });
    }
    directories.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ directory: current, parent: path.dirname(current), directories });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const status = code === 'ENOENT' || code === 'ENOTDIR' ? 404 : code === 'EACCES' || code === 'EPERM' ? 403 : 500;
    return res.status(status).json({ error: 'Unable to read directory' });
  }
}
