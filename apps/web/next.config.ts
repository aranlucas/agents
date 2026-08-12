import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import "./src/env";

const nextConfig: NextConfig = {
  // The floating development badge overlaps mobile bottom actions. Runtime and
  // compile errors still surface in the Next.js overlay and terminal.
  devIndicators: false,
  typescript: {
    // TS 7.0 RC (Go) has no JS API yet; @typescript/typescript6 provides it for Next.js
    ignoreBuildErrors: true,
  },
};

export default withSentryConfig(nextConfig, {
  org: "lucas-hl",
  project: "agents-web",
  silent: !process.env.CI,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
});
