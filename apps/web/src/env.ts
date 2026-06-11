import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    TRAVEL_AGENT_URL: z.url(),
    GROCERY_AGENT_URL: z.url(),
    FITNESS_AGENT_URL: z.url(),
    WELLNESS_AGENT_URL: z.url().default("http://127.0.0.1:8003"),
    A2UI_AGENT_URL: z.url().default("http://127.0.0.1:8004"),
    ORALBOARDS_AGENT_URL: z.url().default("http://127.0.0.1:8005"),
    TRVL_MCP_URL: z.url().optional(),
    KROGER_MCP_URL: z.url().optional(),
    MISTRAL_API_KEY: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
    OTEL_SERVICE_NAME: z.string().default("agents-nextjs"),
    COPILOTKIT_DEBUG: z
      .string()
      .optional()
      .transform((v) => v === "true"),
  },
  client: {
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    TRAVEL_AGENT_URL: process.env.TRAVEL_AGENT_URL ?? "http://127.0.0.1:8000",
    GROCERY_AGENT_URL: process.env.GROCERY_AGENT_URL ?? "http://127.0.0.1:8001",
    FITNESS_AGENT_URL: process.env.FITNESS_AGENT_URL ?? "http://127.0.0.1:8002",
    WELLNESS_AGENT_URL: process.env.WELLNESS_AGENT_URL ?? "http://127.0.0.1:8003",
    A2UI_AGENT_URL: process.env.A2UI_AGENT_URL ?? "http://127.0.0.1:8004",
    ORALBOARDS_AGENT_URL: process.env.ORALBOARDS_AGENT_URL ?? "http://127.0.0.1:8005",
    TRVL_MCP_URL: process.env.TRVL_MCP_URL,
    KROGER_MCP_URL: process.env.KROGER_MCP_URL,
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    COPILOTKIT_DEBUG: process.env.COPILOTKIT_DEBUG,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
});
