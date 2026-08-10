import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const agentGateway = process.env.EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 1,
  tracePropagationTargets: ["localhost", ...(agentGateway ? [agentGateway] : [])],
});

export { Sentry };
