import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Contract uploads (PDF / Word) go through server actions: allow 4 MB files plus the form overhead.
  experimental: { serverActions: { bodySizeLimit: "4.2mb" } },
  // Pre-built JSON (register, clause index, briefs) is read with fs at runtime; ship it with every route.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*.json", "./data/raw/**/*.md", "./data/raw/**/*.csv"],
  },
  outputFileTracingExcludes: {
    "/**": ["./data/cache/**", "./data/state/**"],
  },
};

export default nextConfig;
