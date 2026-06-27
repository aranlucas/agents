export const maxDuration = 60;

import { CopilotSseRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";
import { GatewayBackedRunner } from "@/lib/copilotkit/gateway-backed-runner";

const EXCALIDRAW_AGUI_URL = `${agentBaseUrl(env.AGENTS_BASE_URL)}/excalidraw/agui`;

const runtime = new CopilotSseRuntime({
  agents: {
    excalidraw: new HttpAgent({
      url: EXCALIDRAW_AGUI_URL,
      debug: env.COPILOTKIT_DEBUG,
    }),
  },
  runner: new GatewayBackedRunner({ excalidraw: EXCALIDRAW_AGUI_URL }),
  mcpApps: {
    servers: [
      {
        type: "http",
        url: "https://mcp.excalidraw.com",
        // Stable serverId so MCP App activities restore correctly if the URL
        // ever changes between environments.
        serverId: "excalidraw",
      },
    ],
  },
  debug: env.COPILOTKIT_DEBUG,
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit-excalidraw",
  mode: "multi-route",
  cors: true,
  hooks: {
    onRequest: async ({ request }) => {
      const { userId, getToken } = await auth();
      const sessionToken = userId ? await getToken().catch(() => null) : null;
      if (userId) request.headers.set("x-clerk-user-id", userId);
      if (sessionToken) request.headers.set("authorization", `Bearer ${sessionToken}`);
    },
  },
});

const guarded = async (request: Request): Promise<Response> => {
  if (request.method !== "OPTIONS") {
    const { userId } = await auth();
    if (!userId) return new Response("Unauthorized", { status: 401 });
  }
  return handler(request);
};

export const GET = guarded;
export const POST = guarded;
export const OPTIONS = handler;
export const PATCH = guarded;
export const DELETE = guarded;
