import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
