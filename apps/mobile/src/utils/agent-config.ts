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
  copilotKitRuntimeUrl:
    typeof extra.copilotKitRuntimeUrl === "string" ? extra.copilotKitRuntimeUrl : undefined,
  travel: typeof extra.travelAgentUrl === "string" ? extra.travelAgentUrl : undefined,
  grocery: typeof extra.groceryAgentUrl === "string" ? extra.groceryAgentUrl : undefined,
  fitness: typeof extra.fitnessAgentUrl === "string" ? extra.fitnessAgentUrl : undefined,
  wellness: typeof extra.wellnessAgentUrl === "string" ? extra.wellnessAgentUrl : undefined,
  a2ui: typeof extra.a2uiAgentUrl === "string" ? extra.a2uiAgentUrl : undefined,
};

export function getAgentUrl(agentId: AgentId) {
  return getAgentUrlCore(agentId, config, Platform.OS);
}

/** Returns the CopilotKit runtime base URL for use with CopilotKitProvider. */
export function getCopilotKitRuntimeUrl(): string | undefined {
  return getCopilotKitRuntimeBaseUrl(config, Platform.OS);
}

export type { AgentId };
