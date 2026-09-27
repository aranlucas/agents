import { defineRailway, github, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  // SQLite lives on this volume. Railway volumes attach to one service and
  // one replica, so the gateway must stay at a single replica.
  const data = volume("agents-data");

  const agentsGateway = service("agents-gateway", {
    // Wait for the GitHub CI check suite so a failing main never deploys.
    source: github("aranlucas/agents", { checkSuites: true }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    // Volumes are not mounted during pre-deploy, so `agents serve` applies
    // migrations itself before listening.
    volumeMounts: { "/app/.data": data },
    healthcheck: "/ready",
    replicas: { "us-west2": 1 },
    deploy: {
      // The gateway is idle most of the time. Serverless keeps the public
      // endpoint available while avoiding continuous CPU and memory charges.
      sleepApplication: true,
      limitOverride: { containers: { cpu: 1, memoryBytes: 1000000000 } },
    },
    env: {
      APP_ENV: preserve(),

      // The image runs as a non-root user; Railway volumes are root-owned.
      RAILWAY_RUN_UID: "0",

      // Browser origins and Clerk-issued JWT verification.
      ALLOWED_ORIGINS: preserve(),
      CLERK_ISSUER: preserve(),
      CLERK_JWKS_URL: preserve(),
      CLERK_SECRET_KEY: preserve(),

      // Model providers.
      GEMINI_API_KEY: preserve(),
      GROQ_API_KEY: preserve(),
      MISTRAL_API_KEY: preserve(),
      NVIDIA_NIM_API_KEY: preserve(),
      OPENROUTER_API_KEY: preserve(),

      // Agent-specific credentials.
      BRAVE_API_KEY: preserve(),
      GOOGLE_APPLICATION_CREDENTIALS_JSON: preserve(),

      // Telegram account linking served by the gateway.
      TELEGRAM_BOT_TOKEN: preserve(),
      TELEGRAM_BOT_USERNAME: preserve(),
      TELEGRAM_LINK_SECRET: preserve(),

      // Observability. SENTRY_DSN is unset today; listing it keeps the gateway
      // from planning a delete once it is set in the dashboard.
      SENTRY_DSN: preserve(),
    },
  });

  return project("agents", {
    resources: [data, agentsGateway],
  });
});
