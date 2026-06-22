export const maxDuration = 60;

import { CopilotSseRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import { agentBaseUrl } from "@/lib/agent-url";
import { getKrogerAccessToken } from "@/lib/kroger-token";
import { getStravaAccessToken } from "@/lib/strava-token";
import { AGENT_BACKEND_PATHS, AGENT_ORDER, type AgentId } from "@/components/chat/agents/registry";
import { GroqTranscriptionService } from "@/lib/copilotkit/groq-transcription";
import { isPublicCopilotPath } from "./guard";

const CLERK_USER_ID_HEADER = "x-clerk-user-id";
const KROGER_TOKEN_HEADER = "x-kroger-access-token";
const STRAVA_TOKEN_HEADER = "x-strava-access-token";

const runtime = new CopilotSseRuntime({
  agents: Object.fromEntries(
    AGENT_ORDER.map((id) => [
      id,
      new HttpAgent({
        url: `${agentBaseUrl(env.AGENTS_BASE_URL)}/${AGENT_BACKEND_PATHS[id]}/agui`,
        debug: env.COPILOTKIT_DEBUG,
      }),
    ]),
  ),
  transcriptionService: new GroqTranscriptionService(env.GROQ_API_KEY),
  a2ui: { injectA2UITool: true, agents: ["a2ui"] },
  debug: env.COPILOTKIT_DEBUG,
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  mode: "multi-route",
  cors: true,
  hooks: {
    // Attach per-request auth context. The runtime forwards `authorization` +
    // all `x-*` headers from this request to the remote agent (see
    // configureAgentForRequest -> extractForwardableHeaders), so these reach
    // the Railway services without any per-agent header wiring.
    //
    // Headers are mutated in place; do NOT `return new Request(request, …)`:
    // passing a Request object to the constructor reads the input's private
    // `#state`, which throws across bundler realms on Vercel (the global
    // Request class differs from the one backing the incoming Next.js request).
    onRequest: async ({ request }) => {
      const { userId, getToken } = await auth();
      const sessionToken = userId ? await getToken().catch(() => null) : null;
      const { token: krogerToken } = await getKrogerAccessToken().catch(() => ({
        connected: false,
        token: null,
      }));
      const { token: stravaToken } = await getStravaAccessToken().catch((err) => {
        console.error("[copilotkit] getStravaAccessToken error:", err);
        return { connected: false, token: null };
      });

      if (userId) {
        request.headers.set(CLERK_USER_ID_HEADER, userId);
      }
      if (sessionToken) {
        request.headers.set("authorization", `Bearer ${sessionToken}`);
      }
      if (krogerToken) {
        request.headers.set(KROGER_TOKEN_HEADER, krogerToken);
      }
      if (stravaToken) {
        request.headers.set(STRAVA_TOKEN_HEADER, stravaToken);
      }
    },
  },
});

// Intercepts agent/connect requests to replay thread history as a MessagesSnapshot
// SSE event. CopilotKit's InMemoryAgentRunner has no persistence across serverless
// invocations, so without this the transcript appears empty on refresh even though
// the ADK session on the gateway is still alive. The gateway's /agents/state endpoint
// returns the full message history for a given thread, which we surface here.
async function handleConnectHistory(
  request: Request,
  agentId: string,
): Promise<Response | null> {
  const backendPath = AGENT_BACKEND_PATHS[agentId as AgentId];
  if (!backendPath) return null;

  let threadId: string | undefined;
  try {
    const body = await request.clone().json();
    threadId = (body?.thread_id as string) || undefined;
  } catch {
    return null;
  }
  if (!threadId) return null;

  const { userId, getToken } = await auth();
  const sessionToken = userId ? await getToken().catch(() => null) : null;

  const fwdHeaders: Record<string, string> = {
    "content-type": "application/json",
  };
  if (userId) fwdHeaders["x-clerk-user-id"] = userId;
  if (sessionToken) fwdHeaders["authorization"] = `Bearer ${sessionToken}`;

  let stateData: { threadExists: boolean; messages: unknown[] } | null = null;
  try {
    const res = await fetch(
      `${agentBaseUrl(env.AGENTS_BASE_URL)}/${backendPath}/agents/state`,
      { method: "POST", headers: fwdHeaders, body: JSON.stringify({ threadId }) },
    );
    if (res.ok) {
      stateData = (await res.json()) as { threadExists: boolean; messages: unknown[] };
    }
  } catch {
    // If the gateway is unreachable, fall through to the standard empty connect.
  }

  const messages = stateData?.threadExists ? (stateData.messages ?? []) : [];
  let sseBody = "";
  if (messages.length > 0) {
    sseBody = `data: ${JSON.stringify({ type: "MESSAGES_SNAPSHOT", messages })}\n\n`;
  }

  return new Response(sseBody, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

const guarded = async (request: Request): Promise<Response> => {
  const { pathname } = new URL(request.url);

  // Intercept connect requests before auth guard so we can forward auth headers
  // ourselves inside handleConnectHistory.
  const connectMatch = /\/agent\/([^/]+)\/connect$/.exec(pathname);
  if (connectMatch && request.method === "POST") {
    if (!isPublicCopilotPath(pathname)) {
      const { userId } = await auth();
      if (!userId) return new Response("Unauthorized", { status: 401 });
    }
    const result = await handleConnectHistory(request, connectMatch[1]);
    if (result) return result;
  }

  if (request.method !== "OPTIONS" && !isPublicCopilotPath(pathname)) {
    const { userId } = await auth();
    if (!userId) {
      return new Response("Unauthorized", { status: 401 });
    }
  }
  return handler(request);
};

export const GET = guarded;
export const POST = guarded;
export const OPTIONS = handler;
export const PATCH = guarded;
export const DELETE = guarded;
