import * as Sentry from "@sentry/react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;

// Errors-only: without a DSN the SDK stays disabled, so local development and
// builds without Sentry configured behave exactly as before.
Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
});

export { Sentry };
