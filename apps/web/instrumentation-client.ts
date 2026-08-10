import * as Sentry from "@sentry/nextjs";

const agentGateway = process.env.NEXT_PUBLIC_AGENTS_BASE_URL;

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 1,
  tracePropagationTargets: ["localhost", /^\//, ...(agentGateway ? [agentGateway] : [])],
});
