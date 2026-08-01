import * as Sentry from "@sentry/nextjs";

// Errors-only: tracing stays on @vercel/otel (see instrumentation.ts), so no
// tracesSampleRate is set and Sentry must not install a second OTel provider.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  skipOpenTelemetrySetup: true,
});
