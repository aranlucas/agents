import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  getCopilotKitRuntimeBaseUrl,
  getAgentUrl as getAgentUrlCore,
  type AgentId,
  type AgentRuntimeConfig,
} from "./agent-config-core";

const extra = Constants.expoConfig?.extra ?? {};

const config: AgentRuntimeConfig = {
  agentsBaseUrl: typeof extra.agentsBaseUrl === "string" ? extra.agentsBaseUrl : undefined,
  copilotKitRuntimeUrl:
    typeof extra.copilotKitRuntimeUrl === "string" ? extra.copilotKitRuntimeUrl : undefined,
};

export function getAgentUrl(agentId: AgentId) {
  return getAgentUrlCore(agentId, config, Platform.OS);
}

/** Returns the CopilotKit runtime base URL for use with CopilotKitProvider. */
export function getCopilotKitRuntimeUrl(): string | undefined {
  return getCopilotKitRuntimeBaseUrl(config, Platform.OS);
}

export type { AgentId };
