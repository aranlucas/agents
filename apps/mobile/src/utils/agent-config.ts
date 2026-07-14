import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  getAgentsBaseUrl as getAgentsBaseUrlCore,
  getCopilotKitRuntimeBaseUrl,
  type AgentRuntimeConfig,
} from "./agent-config-core";

const extra = Constants.expoConfig?.extra ?? {};

const config: AgentRuntimeConfig = {
  agentsBaseUrl: typeof extra.agentsBaseUrl === "string" ? extra.agentsBaseUrl : undefined,
  copilotKitRuntimeUrl:
    typeof extra.copilotKitRuntimeUrl === "string" ? extra.copilotKitRuntimeUrl : undefined,
};

/** Returns the CopilotKit runtime base URL for use with CopilotKitProvider. */
export function getCopilotKitRuntimeUrl(): string {
  const runtimeUrl = getCopilotKitRuntimeBaseUrl(config, Platform.OS);
  if (!runtimeUrl) {
    throw new Error("EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL is required");
  }
  return runtimeUrl;
}

export function getAgentsBaseUrl(): string {
  return getAgentsBaseUrlCore(config, Platform.OS);
}

export type { AgentId } from "@agents/types";
