import { AGENT_BACKEND_PATHS, type AgentId } from "@agents/types";

export type { AgentId };

export type AgentRuntimeConfig = {
  agentsBaseUrl?: string;
  copilotKitRuntimeUrl?: string;
};

const AGENTS_BASE_ENV_KEY = "EXPO_PUBLIC_AGENTS_BASE_URL";
const COPILOTKIT_RUNTIME_ENV_KEY = "EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL";

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function normalizeAguiUrl(value: string) {
  const withoutTrailingSlash = stripTrailingSlash(value);
  return withoutTrailingSlash.endsWith("/agui")
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/agui`;
}

export function normalizeCopilotKitRuntimeUrl(value: string, agentId: AgentId) {
  const withoutTrailingSlash = stripTrailingSlash(value);
  return `${withoutTrailingSlash}/agent/${agentId}/run`;
}

function normalizeLocalhostForPlatform(value: string, os: string) {
  if (os !== "android") return value;

  return value.replace(/^http:\/\/(localhost|127\.0\.0\.1)(?::|\/|$)/, (match, _host) =>
    match.replace(_host, "10.0.2.2"),
  );
}

function nonEmpty(value: string | undefined) {
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  return value?.trim() || undefined;
}

function envOrConfig(
  env: Record<string, string | undefined>,
  envKey: string,
  configValue: string | undefined,
) {
  return envKey in env ? nonEmpty(env[envKey]) : nonEmpty(configValue);
}

/**
 * Returns the CopilotKit runtime base URL (e.g. https://example.com/api/copilotkit)
 * with the Android localhost rewrite applied, or undefined if not configured.
 * Use this as the `runtimeUrl` for `CopilotKitProvider`.
 */
export function getCopilotKitRuntimeBaseUrl(
  config: AgentRuntimeConfig,
  os: string,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const url = envOrConfig(env, COPILOTKIT_RUNTIME_ENV_KEY, config.copilotKitRuntimeUrl);
  if (!url) return undefined;
  return normalizeLocalhostForPlatform(stripTrailingSlash(url), os);
}

export function getAgentsBaseUrl(
  config: AgentRuntimeConfig,
  os: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = envOrConfig(env, AGENTS_BASE_ENV_KEY, config.agentsBaseUrl);
  const baseUrl = configured ?? `http://${os === "android" ? "10.0.2.2" : "localhost"}:8000`;
  return stripTrailingSlash(normalizeLocalhostForPlatform(baseUrl, os));
}

export function getAgentUrl(
  agentId: AgentId,
  config: AgentRuntimeConfig,
  os: string,
  env: Record<string, string | undefined> = process.env,
) {
  const runtimeBaseUrl = envOrConfig(env, COPILOTKIT_RUNTIME_ENV_KEY, config.copilotKitRuntimeUrl);
  if (runtimeBaseUrl) {
    return normalizeLocalhostForPlatform(
      normalizeCopilotKitRuntimeUrl(runtimeBaseUrl, agentId),
      os,
    );
  }

  const baseUrl = getAgentsBaseUrl(config, os, env);
  const backendPath = AGENT_BACKEND_PATHS[agentId];
  return normalizeAguiUrl(
    `${stripTrailingSlash(normalizeLocalhostForPlatform(baseUrl, os))}/${backendPath}`,
  );
}
