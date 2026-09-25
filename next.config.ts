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

const nextConfig: NextConfig = {
  // Allow LAN access to dev assets and HMR without trusting arbitrary origins.
  allowedDevOrigins: [...new Set([
    ...(process.env.PURPLEMUX_ALLOWED_DEV_ORIGINS ?? '').split(/[,\s]+/).filter(Boolean),
    ...Object.values(networkInterfaces()).flatMap((addresses) =>
      (addresses ?? []).map(({ address, family }) => family === 'IPv6' ? `[${address}]` : address),
    ),
  ])],
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
  output: 'standalone',
  bundlePagesRouterDependencies: true,
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
