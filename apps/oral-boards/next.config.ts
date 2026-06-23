import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  reactCompiler: true,
  typescript: {
    // TS 7.0 RC (Go native) has no JS API — type checking runs via `tsc --noEmit` separately
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ["better-sqlite3"],
  outputFileTracingIncludes: {
    "/api/search": ["./search.sqlite", "./node_modules/better-sqlite3/**"],
    "/api/doc/[docid]": ["./search.sqlite", "./node_modules/better-sqlite3/**"],
  },
  turbopack: {
    root: path.resolve("../.."),
  },
};

export default nextConfig;
