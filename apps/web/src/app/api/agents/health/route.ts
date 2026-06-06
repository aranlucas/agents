import { NextResponse } from "next/server";
import { env } from "@/env";

const AGENT_URLS: Record<string, string> = {
  travel: env.TRAVEL_AGENT_URL,
  grocery: env.GROCERY_AGENT_URL,
  fitness: env.FITNESS_AGENT_URL,
  wellness: env.WELLNESS_AGENT_URL,
  a2ui: env.A2UI_AGENT_URL,
};

async function checkAgent(
  name: string,
  baseUrl: string,
): Promise<{ name: string; status: "ok" | "error" }> {
  try {
    const res = await fetch(`${baseUrl}/health`, {
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
    Object.entries(AGENT_URLS).map(([name, url]) => checkAgent(name, url)),
  );

  const agents = Object.fromEntries(results.map(({ name, status }) => [name, status]));
  const runningCount = results.filter((r) => r.status === "ok").length;

  return NextResponse.json({ agents, runningCount, total: results.length });
}
