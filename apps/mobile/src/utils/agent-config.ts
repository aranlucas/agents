import Constants from "expo-constants";
import { Platform } from "react-native";
import {
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

export type { AgentId };
