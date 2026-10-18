import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GetServerSidePropsContext } from 'next';
import { describe, expect, it, vi } from 'vitest';
import { buildSessionFilePreviewUrl, getSessionFileReturnUrl } from '@/lib/session-file-url';
import FilePreview, { getServerSideProps } from '@/pages/file-preview';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@/lib/load-messages', () => ({ loadMessagesServer: async () => ({}) }));
vi.mock('@/lib/require-auth', () => ({ requireAuth: async (_context: unknown, handler: () => unknown) => handler() }));

describe('file preview navigation', () => {
  it('encodes file paths and preserves the source page and line', () => {
    const url = new URL(buildSessionFilePreviewUrl({ path: '/tmp/中文 #?.md', line: 12 }, '/?view=chat#session'), 'http://localhost');
    expect(url.pathname).toBe('/file-preview');
    expect(url.searchParams.get('file')).toBe('/tmp/中文 #?.md');
    expect(url.searchParams.get('returnTo')).toBe('/?view=chat#session');
    expect(url.searchParams.get('line')).toBe('12');
  });

  it.each([undefined, ['/?ok'], 'https://evil.test', '//evil.test', '/\\evil.test', '/\nevil.test', '/api/session-files/tmp/test.html', '/file-preview', 'javascript:alert(1)'])(
    'falls back to the app for an unsafe return destination %s', (value) => {
      expect(getSessionFileReturnUrl(value)).toBe('/');
    },
  );

  it('serves the text viewer with the original line anchor and disables caching', async () => {
    const setHeader = vi.fn();
    const result = await getServerSideProps({
      query: { file: '/tmp/中文 #?.md', line: '12', returnTo: '/?view=chat#session' },
      res: { setHeader },
    } as unknown as GetServerSidePropsContext);
    expect(result).toMatchObject({ props: {
      name: '中文 #?.md', src: '/api/session-files/tmp/%E4%B8%AD%E6%96%87%20%23%3F.md?view=1#L12', returnTo: '/?view=chat#session',
    } });
    expect(setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });

  it('keeps a return link for an invalid file request', async () => {
    const result = await getServerSideProps({ query: { file: 'https://evil.test', returnTo: '//evil.test' }, res: { setHeader: vi.fn() } } as unknown as GetServerSidePropsContext);
    expect(result).toMatchObject({ props: { name: '', src: null, returnTo: '/' } });
    const html = renderToStaticMarkup(createElement(FilePreview, { name: '', src: null, returnTo: '/' }));
    expect(html).toContain('href="/"');
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('<iframe');
  });

  it.each(['report.md', 'report.html', 'chart.svg'])(
    'keeps navigation outside the sandboxed %s content', (name) => {
      const html = renderToStaticMarkup(createElement(FilePreview, { name, src: `/api/session-files/tmp/${name}?view=1`, returnTo: '/?view=chat' }));
      expect(html).toContain('href="/?view=chat"');
      expect(html).toContain('min-h-11');
      expect(html).toContain('sandbox="allow-same-origin allow-downloads"');
      expect(html).not.toContain('allow-scripts');
      expect(html).not.toContain('allow-top-navigation');
      expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('<iframe'));
    },
  );

  it('allows the native PDF viewer while retaining the return link', () => {
    const html = renderToStaticMarkup(createElement(FilePreview, { name: 'report.PDF', src: '/api/session-files/tmp/report.PDF?view=1', returnTo: '/' }));
    expect(html).toContain('href="/"');
    expect(html).toContain('<iframe');
    expect(html).not.toContain('sandbox=');
  });
});
