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

// oxlint resolves @sentry/nextjs through its server export condition here,
// while Next.js compiles this client-only entrypoint against the client export.
// oxlint-disable-next-line import/namespace
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
