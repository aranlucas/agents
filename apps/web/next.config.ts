import type { NextConfig } from "next";
import "./src/env";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["@copilotkit/runtime"],
};

export default nextConfig;
