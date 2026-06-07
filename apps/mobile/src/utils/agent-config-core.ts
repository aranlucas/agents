export type AgentId = "travel" | "grocery" | "fitness" | "wellness" | "a2ui";

export type AgentRuntimeConfig = Partial<Record<AgentId, string>> & {
  copilotKitRuntimeUrl?: string;
};

const AGENT_PORTS: Record<AgentId, number> = {
  travel: 8000,
  grocery: 8001,
  fitness: 8002,
  wellness: 8003,
  a2ui: 8004,
};

const EXPO_PUBLIC_ENV_KEYS: Record<AgentId, string> = {
  travel: "EXPO_PUBLIC_TRAVEL_AGENT_URL",
  grocery: "EXPO_PUBLIC_GROCERY_AGENT_URL",
  fitness: "EXPO_PUBLIC_FITNESS_AGENT_URL",
  wellness: "EXPO_PUBLIC_WELLNESS_AGENT_URL",
  a2ui: "EXPO_PUBLIC_A2UI_AGENT_URL",
};

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

export function getDefaultAgentBaseUrl(agentId: AgentId, os: string) {
  const host = os === "android" ? "10.0.2.2" : "localhost";
  return `http://${host}:${AGENT_PORTS[agentId]}`;
}

function normalizeLocalhostForPlatform(value: string, os: string) {
  if (os !== "android") return value;

  return value.replace(/^http:\/\/(localhost|127\.0\.0\.1)(?::|\/|$)/, (match, _host) =>
    match.replace(_host, "10.0.2.2"),
  );
}

export function getAgentUrl(
  agentId: AgentId,
  config: AgentRuntimeConfig,
  os: string,
  env: Record<string, string | undefined> = process.env,
) {
  const runtimeBaseUrl = env[COPILOTKIT_RUNTIME_ENV_KEY] ?? config.copilotKitRuntimeUrl;
  if (runtimeBaseUrl) {
    return normalizeLocalhostForPlatform(
      normalizeCopilotKitRuntimeUrl(runtimeBaseUrl, agentId),
      os,
    );
  }

  const configured = env[EXPO_PUBLIC_ENV_KEYS[agentId]] ?? config[agentId];
  const baseUrl = configured ?? getDefaultAgentBaseUrl(agentId, os);
  return normalizeAguiUrl(normalizeLocalhostForPlatform(baseUrl, os));
}
