import { NextResponse } from "next/server";
import { AGENT_BACKEND_PATHS } from "@/components/chat/agents/registry";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";
import { OFFLINE_AGENT_HEALTH_RESPONSE } from "@/lib/offline-fixtures";
import { isOfflineAgentTestMode } from "@/lib/offline-mode";

async function checkAgent(
  name: string,
  path: string,
): Promise<{ name: string; status: "ok" | "error" }> {
  try {
    const res = await fetch(`${agentBaseUrl(env.AGENTS_BASE_URL)}/${path}/health`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    return { name, status: res.ok ? "ok" : "error" };
  } catch {
    return { name, status: "error" };
  }
}

export async function GET() {
  if (isOfflineAgentTestMode()) {
    return NextResponse.json(OFFLINE_AGENT_HEALTH_RESPONSE);
  }

  const results = await Promise.all(
    Object.entries(AGENT_BACKEND_PATHS).map(([name, path]) => checkAgent(name, path)),
  );

  const agents = Object.fromEntries(results.map(({ name, status }) => [name, status]));
  const runningCount = results.filter((r) => r.status === "ok").length;

  return NextResponse.json({ agents, runningCount, total: results.length });
}
