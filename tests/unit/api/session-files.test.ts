import { createServer, type Server } from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { NextApiRequest, NextApiResponse } from 'next';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TEXT_PREVIEW_BYTES } from '@/lib/session-files';

const mocks = vi.hoisted(() => ({ session: vi.fn(), cli: vi.fn(), workspaces: vi.fn() }));
vi.mock('@/lib/auth', () => ({ verifyRequestSession: mocks.session }));
vi.mock('@/lib/cli-token', () => ({ verifyCliToken: mocks.cli }));
vi.mock('@/lib/workspace-store', () => ({ getWorkspaces: mocks.workspaces }));
vi.mock('@/lib/logger', () => ({ createLogger: () => ({ error: vi.fn() }) }));
import handler from '@/pages/api/session-files/[...path]';

let directory: string;
let server: Server;
let origin: string;
const url = (name: string) => `${origin}/api/session-files${path.join(directory, name).split('/').map(encodeURIComponent).join('/')}`;

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'session-files-api-'));
  await Promise.all([
    writeFile(path.join(directory, '中文 #.md'), '# Report\n<script>bad()</script>'),
    writeFile(path.join(directory, 'report.html'), '<h1>Report</h1><img src="chart.png">'),
    writeFile(path.join(directory, 'chart.png'), Buffer.from([137, 80, 78, 71])),
    writeFile(path.join(directory, 'report.pdf'), '%PDF-1.7'),
    writeFile(path.join(directory, 'archive.bin'), Buffer.from([0, 255, 1])),
    writeFile(path.join(directory, 'style.css'), 'body{color:red}'),
    writeFile(path.join(directory, 'large.txt'), Buffer.alloc(MAX_TEXT_PREVIEW_BYTES + 1, 'a')),
  ]);
  server = createServer((incoming, outgoing) => {
    const parsed = new URL(incoming.url!, 'http://localhost');
    const req = Object.assign(incoming, { query: {
      ...Object.fromEntries(parsed.searchParams),
      path: parsed.pathname.slice('/api/session-files/'.length).split('/').map(decodeURIComponent),
    } }) as unknown as NextApiRequest;
    const res = outgoing as NextApiResponse;
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); return res; };
    res.send = (data) => { res.end(data); return res; };
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(true);
  mocks.cli.mockReturnValue(false);
  mocks.workspaces.mockResolvedValue({ workspaces: [{ directories: [directory] }] });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(directory, { recursive: true, force: true });
});

describe('authenticated file HTTP responses', () => {
  it('rejects unauthenticated requests without reading the workspace configuration', async () => {
    mocks.session.mockResolvedValue(false);
    const response = await fetch(url('chart.png'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.workspaces).not.toHaveBeenCalled();
  });

  it('accepts CLI authentication and streams the original file bytes', async () => {
    mocks.session.mockResolvedValue(false);
    mocks.cli.mockReturnValue(true);
    const response = await fetch(url('archive.bin'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([0, 255, 1]));
    expect(mocks.session).not.toHaveBeenCalled();
  });

  it('renders safe mobile text with line anchors and no script execution', async () => {
    const response = await fetch(`${url('中文 #.md')}?view=1`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('content-security-policy')).toContain('sandbox;');
    const content = await response.text();
    expect(content).toContain('id="L2"');
    expect(content).toContain('&lt;script&gt;bad()&lt;/script&gt;');
    expect(content).toContain('中文 #.md');
  });

  it('sandboxes generated HTML and serves its relative resources', async () => {
    const response = await fetch(`${url('report.html')}?view=1`);
    const policy = response.headers.get('content-security-policy');
    expect(policy).toContain('sandbox allow-same-origin;');
    expect(policy).not.toContain('allow-scripts');
    expect(policy).toContain(`${origin}/api/session-files/`);
    expect(policy).toContain("default-src 'none'");
    expect(await response.text()).toContain('src="chart.png"');
    const image = await fetch(new URL('chart.png', response.url));
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await image.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71]));
  });

  it.each([['report.pdf', 'application/pdf'], ['style.css', 'text/css; charset=utf-8'], ['中文 #.md', 'text/plain; charset=utf-8']])(
    'serves %s with its native content type', async (name, mime) => {
      const response = await fetch(url(name));
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe(mime);
      expect(response.headers.get('content-disposition')).toMatch(/^inline;/);
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('referrer-policy')).toBe('no-referrer');
      await response.arrayBuffer();
    },
  );

  it('reports oversize previews, missing files, directories and forbidden paths', async () => {
    expect((await fetch(`${url('large.txt')}?view=1`)).status).toBe(413);
    expect((await fetch(url('gone.md'))).status).toBe(404);
    expect((await fetch(url(''))).status).toBe(404);
    expect((await fetch(`${origin}/api/session-files/etc/passwd`)).status).toBe(403);
    expect((await fetch(`${origin}/api/session-files/tmp/encoded%2Fslash`)).status).toBe(400);
  });

  it('does not accept writes', async () => {
    const response = await fetch(url('report.html'), { method: 'POST', body: 'overwrite' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });
});
