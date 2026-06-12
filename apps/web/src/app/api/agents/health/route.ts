import { NextResponse } from "next/server";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";

const AGENT_PATHS = {
  travel: "travel",
  grocery: "grocery",
  fitness: "fitness",
  wellness: "wellness",
  "oral-boards": "oralboards",
  a2ui: "a2ui",
};

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
  const results = await Promise.all(
    Object.entries(AGENT_PATHS).map(([name, path]) => checkAgent(name, path)),
  );

  const agents = Object.fromEntries(results.map(({ name, status }) => [name, status]));
  const runningCount = results.filter((r) => r.status === "ok").length;

  return NextResponse.json({ agents, runningCount, total: results.length });
}
