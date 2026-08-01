import * as Sentry from "@sentry/nextjs";

// Errors-only: no tracesSampleRate is set, so tracing stays disabled.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
});
