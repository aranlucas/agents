import { NextResponse } from "next/server";

import { isAgentId } from "@/components/chat/agents/registry";
import {
  OFFLINE_COPILOTKIT_INFO_RESPONSE,
  OFFLINE_AUTH_CONNECTION_RESPONSE,
  offlineAgentReply,
} from "@/lib/offline-fixtures";

function sseEvent(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

function getAgentId(pathname: string): string | null {
  return /^\/api\/copilotkit\/agent\/([^/]+)\/(?:run|connect)$/.exec(pathname)?.[1] ?? null;
}

function createOfflineAgentStream(agentId: string): Response {
  const encoder = new TextEncoder();
  const runId = `offline-run-${Date.now()}`;
  const threadId = "offline-thread";
  const messageId = `offline-message-${agentId}`;
  const content = offlineAgentReply(agentId);
  const stream = new ReadableStream({
    start(controller) {
      const events = [
        { type: "RUN_STARTED", threadId, runId },
        { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId, delta: content },
        { type: "TEXT_MESSAGE_END", messageId },
        { type: "RUN_FINISHED", threadId, runId, outcome: "success" },
      ];

      for (const event of events) {
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

export async function handleOfflineCopilotKitRequest(request: Request): Promise<Response> {
  const { pathname } = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (pathname === "/api/copilotkit/info" && request.method === "GET") {
    return NextResponse.json(OFFLINE_COPILOTKIT_INFO_RESPONSE);
  }

  if (pathname === "/api/copilotkit/transcribe") {
    return NextResponse.json({ text: "Offline transcription is not available." });
  }

  if (pathname === "/api/copilotkit" && request.method === "POST") {
    return NextResponse.json(OFFLINE_AUTH_CONNECTION_RESPONSE);
  }

  const agentId = getAgentId(pathname);
  if (agentId && isAgentId(agentId) && request.method === "POST") {
    return createOfflineAgentStream(agentId);
  }

  return NextResponse.json({ error: "Offline CopilotKit mock route not found" }, { status: 404 });
}
