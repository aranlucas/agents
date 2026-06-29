import type { NextConfig } from "next";
import "./src/env";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@copilotkit/runtime"],
  typescript: {
    // TS 7.0 RC (Go) has no JS API yet; @typescript/typescript6 provides it for Next.js
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
