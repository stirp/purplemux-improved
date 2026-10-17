import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { getOpenedFilePath } from '@/lib/opened-file-path';

export const MAX_TEXT_PREVIEW_BYTES = 2 * 1024 * 1024;

export class SessionFileError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const isWithin = (root: string, target: string): boolean => {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

export const openSessionFile = async (parts: unknown, roots: string[]) => {
  if (!Array.isArray(parts) || !parts.length || parts.some((part) =>
    typeof part !== 'string' || !part || part === '.' || part === '..' || /[/\\\x00-\x1f\x7f]/.test(part))) {
    throw new SessionFileError(400, 'Invalid file path');
  }
  const requested = path.resolve('/', ...parts);
  const [resolved, allowedRoots] = await Promise.all([
    realpath(requested),
    Promise.all(roots.filter((root) => path.isAbsolute(root)).map((root) => realpath(root).catch(() => null))),
  ]);
  if (!allowedRoots.some((root) => root && isWithin(root, resolved))) {
    throw new SessionFileError(403, 'Path not allowed');
  }
  // Nonblocking open prevents a FIFO from hanging before the regular-file check.
  const handle = await open(resolved, constants.O_RDONLY | constants.O_NONBLOCK | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new SessionFileError(404, 'File not found');
    // Read the kernel's descriptor target directly: resolving a pathname again permits parent-swap races.
    const openedPath = await getOpenedFilePath(handle.fd).catch(() => {
      throw new SessionFileError(503, 'Secure file access is unavailable on this server');
    });
    if (!path.isAbsolute(openedPath) || !allowedRoots.some((root) => root && isWithin(root, openedPath))) {
      throw new SessionFileError(403, 'Path not allowed');
    }
    if (info.nlink === 0) throw new SessionFileError(404, 'File not found');
    return { handle, size: info.size, name: path.basename(requested) };
  } catch (error) {
    await handle.close();
    throw error;
  }
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.pdf': 'application/pdf', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const TEXT_EXTENSIONS = new Set([
  '.md', '.mdx', '.txt', '.log', '.csv', '.ts', '.tsx', '.jsx', '.py', '.sh', '.bash',
  '.yaml', '.yml', '.toml', '.xml', '.sql', '.java', '.go', '.rs', '.c', '.h', '.cpp',
  '.rb', '.php', '.vue', '.svelte', '.ini', '.conf', '.diff', '.patch',
]);

export const getSessionFileType = (name: string) => {
  const extension = path.extname(name).toLowerCase();
  const mime = MIME_TYPES[extension] ?? (TEXT_EXTENSIONS.has(extension) ? 'text/plain; charset=utf-8' : 'application/octet-stream');
  return {
    mime,
    text: (mime.startsWith('text/') && !mime.startsWith('text/html')) || extension === '.json',
    active: mime.startsWith('text/html') || extension === '.svg',
    download: mime === 'application/octet-stream',
  };
};

export const getSessionFileCsp = (host: string): string => {
  const { host: safeHost } = new URL(`http://${host}`);
  const resources = `http://${safeHost}/api/session-files/ https://${safeHost}/api/session-files/`;
  // Same-origin keeps SameSite cookies on relative assets; scripts remain disabled.
  return `sandbox allow-same-origin; default-src 'none'; style-src ${resources} 'unsafe-inline'; img-src ${resources} data: blob:; font-src ${resources}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
};

const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);

export const renderSessionFileText = (name: string, content: string): string => {
  const title = escapeHtml(name);
  const lines = content.split('\n').map((line, index) =>
    `<span id="L${index + 1}">${escapeHtml(line)}\n</span>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>
    :root{color-scheme:light dark}body{margin:0;padding:16px;font:16px/1.6 system-ui,sans-serif}h1{font-size:1rem;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.6 ui-monospace,monospace}pre span:target{background:Mark;color:MarkText}
  </style></head><body><h1>${title}</h1><pre>${lines}</pre></body></html>`;
};
