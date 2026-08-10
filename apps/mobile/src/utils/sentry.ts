import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const tracePropagationTargets = [
  "localhost",
  process.env.EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL,
  process.env.EXPO_PUBLIC_AGENTS_BASE_URL,
].filter((target): target is string => Boolean(target));

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 1,
  tracePropagationTargets,
});

export { Sentry };
