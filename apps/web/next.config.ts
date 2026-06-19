import type { NextConfig } from "next";
import "./src/env";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@copilotkit/runtime"],
};

export default nextConfig;
