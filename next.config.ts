import type { NextConfig } from "next";

// O site público leva o banco e o binário do SQLite junto das funções.
const PUBLIC_FILES = ["./data/public.db", "./node_modules/better-sqlite3/prebuilds/linux-x64.node"];

const nextConfig: NextConfig = {
  ...(process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? { outputFileTracingIncludes: { "/*": PUBLIC_FILES, "/**/*": PUBLIC_FILES } } : {}),
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
