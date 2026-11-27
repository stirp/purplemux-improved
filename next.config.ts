import { execSync } from 'child_process';
import { networkInterfaces } from 'os';
import type { NextConfig } from "next";

const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'unknown';
  }
})();

// 部署配置（purplemux.config.json / ~/.purplemux/config.json）里的 basePath。
// 配置文件不存在或没写 basePath 时为空，等于部署在域名根路径（历史行为）。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { readBasePath } = require('./scripts/read-base-path.cjs') as {
  readBasePath: (root?: string) => string;
};
const basePath = readBasePath(process.cwd());

const nextConfig: NextConfig = {
  basePath: basePath || undefined,
  turbopack: {
    root: __dirname,
  },
  // Allow LAN access to dev assets and HMR without trusting arbitrary origins.
  allowedDevOrigins: [...new Set([
    ...(process.env.PURPLEMUX_ALLOWED_DEV_ORIGINS ?? '').split(/[,\s]+/).filter(Boolean),
    ...Object.values(networkInterfaces()).flatMap((addresses) =>
      (addresses ?? []).map(({ address, family }) => family === 'IPv6' ? `[${address}]` : address),
    ),
  ])],
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  output: 'standalone',
  bundlePagesRouterDependencies: true,
  serverExternalPackages: ['koffi'],
  outputFileTracingExcludes: {
    '*': [
      './release/**',
      './CLAUDE.md',
      './AGENTS.md',
      './README*.md',
      './docs/**',
      './.specs/**',
      './.claude/**',
      './tests/**',
    ],
  },
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ['react-icons'],
    turbopackFileSystemCacheForDev: false,
  },
  i18n: {
    locales: ['en', 'ko', 'ja', 'zh-CN', 'es', 'de', 'fr', 'pt-BR', 'zh-TW', 'ru', 'tr'],
    defaultLocale: 'en',
    localeDetection: false,
  },
  headers: async () => [
    {
      source: '/fonts/:path*',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=31536000, immutable',
        },
      ],
    },
  ],
};

export default nextConfig;
