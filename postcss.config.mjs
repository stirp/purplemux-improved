const config = {
  plugins: {
    // Flatten nesting and media ranges, and normalize color syntax in dev too.
    // Tailwind otherwise skips these transforms outside production (Safari <16.5).
    "@tailwindcss/postcss": {
      optimize: { minify: process.env.NODE_ENV === "production" },
    },
  },
};

export default config;
