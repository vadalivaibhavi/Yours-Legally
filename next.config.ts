import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pre-built JSON (register, clause index, briefs) is read with fs at runtime; ship it with every route.
  outputFileTracingIncludes: {
    "/**": ["./data/**/*.json", "./data/raw/**/*.md", "./data/raw/**/*.csv"],
  },
  outputFileTracingExcludes: {
    "/**": ["./data/cache/**", "./data/state/**"],
  },
};

export default nextConfig;
