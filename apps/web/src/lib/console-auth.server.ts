import { auth } from "@clerk/nextjs/server";

import { getAgentConfig, type ConsoleAgentId } from "@/components/chat/agents/registry";

export async function requireConsoleAuth(agent: ConsoleAgentId) {
  if (getAgentConfig(agent).access === "public") return;

  await auth.protect();
}
