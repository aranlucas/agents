import { NextResponse } from "next/server";

import { isAgentId } from "@/components/chat/agents/registry";
import { OFFLINE_COPILOTKIT_INFO_RESPONSE, offlineAgentReply } from "@/lib/offline-fixtures";
import { isOfflineAgentTestMode } from "@/lib/offline-mode";

function sseEvent(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function getAgentId(pathname: string): string | null {
  return /^\/api\/offline-copilotkit\/agent\/([^/]+)\/(?:run|connect)$/.exec(pathname)?.[1] ?? null;
}

function createOfflineAgentStream(agentId: string): Response {
  const encoder = new TextEncoder();
  const runId = `offline-run-${Date.now()}`;
  const threadId = "offline-thread";
  const messageId = `offline-message-${agentId}`;
  const content = offlineAgentReply(agentId);
  const stream = new ReadableStream({
    start(controller) {
      for (const event of [
        { type: "RUN_STARTED", threadId, runId },
        { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId, delta: content },
        { type: "TEXT_MESSAGE_END", messageId },
        { type: "RUN_FINISHED", threadId, runId, outcome: "success" },
      ]) {
        controller.enqueue(encoder.encode(sseEvent(event)));
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

async function handle(request: Request): Promise<Response> {
  if (!isOfflineAgentTestMode()) {
    return NextResponse.json({ error: "Offline fixtures are disabled" }, { status: 404 });
  }

  const { pathname } = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (pathname === "/api/offline-copilotkit/info" && request.method === "GET") {
    return NextResponse.json(OFFLINE_COPILOTKIT_INFO_RESPONSE);
  }

  const agentId = getAgentId(pathname);
  if (agentId && isAgentId(agentId) && request.method === "POST") {
    return createOfflineAgentStream(agentId);
  }

  return NextResponse.json({ error: "Offline fixture route not found" }, { status: 404 });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
