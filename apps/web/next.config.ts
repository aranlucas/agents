import type { NextConfig } from "next";
import "./src/env";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@copilotkit/runtime"],
  typescript: {
    // TS 7.0 RC (Go native) has no JS API — type checking runs via `tsc --noEmit` separately
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
