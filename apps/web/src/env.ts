import { createEnv } from "@t3-oss/env-nextjs";
import * as z from "zod";

export const env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    AGENTS_BASE_URL: z.url().default("https://agents-gateway.up.railway.app"),
    TRVL_MCP_URL: z.url().default("https://trvl-production.up.railway.app/mcp"),
    KROGER_MCP_URL: z.url().default("https://ai-meal-planner-mcp.aranlucas.workers.dev"),
    MISTRAL_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    HUGGING_FACE_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().min(1),
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
    AGENTS_BASE_URL: process.env.AGENTS_BASE_URL ?? "https://agents-gateway.up.railway.app",
    TRVL_MCP_URL: process.env.TRVL_MCP_URL ?? "https://trvl-production.up.railway.app/mcp",
    KROGER_MCP_URL:
      process.env.KROGER_MCP_URL ?? "https://ai-meal-planner-mcp.aranlucas.workers.dev",
    MISTRAL_API_KEY: process.env.MISTRAL_API_KEY,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    HUGGING_FACE_API_KEY: process.env.HUGGING_FACE_API_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    COPILOTKIT_DEBUG: process.env.COPILOTKIT_DEBUG,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
});
