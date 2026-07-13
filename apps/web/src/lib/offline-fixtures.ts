import { AGENT_ORDER } from "@/components/chat/agents/registry";

export const OFFLINE_SOURCE_OF_TRUTH_URL = "https://agents-lucas.vercel.app";

export const OFFLINE_AGENT_HEALTH_RESPONSE = {
  agents: Object.fromEntries(AGENT_ORDER.map((id) => [id, "ok" satisfies "ok"])),
  runningCount: AGENT_ORDER.length,
  total: AGENT_ORDER.length,
};

export const OFFLINE_AUTH_CONNECTION_RESPONSE = {
  connected: false,
};

export const OFFLINE_COPILOTKIT_INFO_RESPONSE = {
  version: "1.61.0",
  agents: Object.fromEntries(
    AGENT_ORDER.map((id) => [
      id,
      {
        name: id,
        description: "",
        className: "ox",
      },
    ]),
  ),
  audioFileTranscriptionEnabled: true,
  mode: "sse",
  a2uiEnabled: false,
  openGenerativeUIEnabled: false,
  telemetryDisabled: false,
};

export function offlineAgentReply(agentId: string): string {
  return `Offline ${agentId} agent mock is running. This deterministic response uses local fixtures and does not call remote APIs or require keys.`;
}
