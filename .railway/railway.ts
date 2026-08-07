import { defineRailway, github, preserve, project, service } from "railway/iac";

export default defineRailway((ctx) => {
  const production = ctx.isEnvironment("production");

  const agentsGateway = service("agents-gateway", {
    source: github("aranlucas/agents", { checkSuites: true }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "agents/Dockerfile",
    },
    preDeploy: ["/app/migrate"],
    healthcheck: "/ready",
    replicas: { "us-west2": 1 },
    deploy: {
      sleepApplication: production ? undefined : true,
      limitOverride: { containers: { cpu: 1, memoryBytes: 1000000000 } },
    },
    env: {
      APP_ENV: preserve(),

      // Cloudflare D1 and R2 are the only persistence layers.
      CF_ACCOUNT_ID: preserve(),
      CF_API_TOKEN: preserve(),
      CF_D1_DATABASE_ID: preserve(),
      CF_R2_ACCESS_KEY_ID: preserve(),
      CF_R2_BUCKET_NAME: preserve(),
      CF_R2_SECRET_ACCESS_KEY: preserve(),

      // Browser origins and Clerk-issued JWT verification.
      ALLOWED_ORIGINS: preserve(),
      CLERK_ISSUER: preserve(),
      CLERK_JWKS_URL: preserve(),
      CLERK_SECRET_KEY: preserve(),

      // Model providers.
      CEREBRAS_API_KEY: preserve(),
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
      OTEL_EXPORTER_OTLP_ENDPOINT: preserve(),
      OTEL_SERVICE_NAME: preserve(),
      SENTRY_DSN: preserve(),

      // Left over from the Python runtime. Nothing under agents/ reads these;
      // delete them here once a destructive plan has been reviewed.
      AGENT_DIR: preserve(),
      AGENT_MODULE: preserve(),
      DATABASE_PUBLIC_URL: preserve(),
      DATABASE_URL: preserve(),
      GOOGLE_API_USE_CLIENT_CERTIFICATE: preserve(),
      LITELLM_LOCAL_MODEL_COST_MAP: preserve(),
      LITELLM_MODE: preserve(),
      LITELLM_SUPPRESS_DEBUG_INFO: preserve(),
      MALLOC_CONF: preserve(),
      PYTHONUNBUFFERED: preserve(),
      PYTHON_JIT: preserve(),
    },
  });

  return project("agents", {
    resources: [agentsGateway],
  });
});
