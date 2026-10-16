import { resolve } from "node:path";

const config = {
  plugins: {
    // Flatten nesting and media ranges, and normalize color syntax in dev too.
    // Tailwind otherwise skips these transforms outside production (Safari <16.5).
    "@tailwindcss/postcss": {
      optimize: { minify: process.env.NODE_ENV === "production" },
    },
    // Turbopack loads plugins from .next/build, so local plugins need an absolute path.
    [resolve("scripts/postcss-alpha-fallback.cjs")]: {},
  },
};

export default config;
