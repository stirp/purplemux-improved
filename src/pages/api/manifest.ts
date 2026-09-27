import type { NextApiRequest, NextApiResponse } from 'next';

const handler = (_req: NextApiRequest, res: NextApiResponse) => {
  const manifest = {
    name: 'purplemux-improved',
    short_name: 'purplemux-improved',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: '#131313',
    background_color: '#131313',
    icons: [
      { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  };

  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(JSON.stringify(manifest));
};

export default handler;
