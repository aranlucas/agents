import { CopilotSseRuntime, createCopilotRuntimeHandler } from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import { getKrogerAccessToken } from "@/lib/kroger-token";
import { getStravaAccessToken } from "@/lib/strava-token";

const CLERK_USER_ID_HEADER = "x-clerk-user-id";
const KROGER_TOKEN_HEADER = "x-kroger-access-token";
const STRAVA_TOKEN_HEADER = "x-strava-access-token";

const runtime = new CopilotSseRuntime({
  agents: {
    travel: new HttpAgent({
      url: env.TRAVEL_AGENT_URL,
      debug: env.COPILOTKIT_DEBUG,
    }),
    grocery: new HttpAgent({
      url: env.GROCERY_AGENT_URL,
      debug: env.COPILOTKIT_DEBUG,
    }),
    fitness: new HttpAgent({
      url: env.FITNESS_AGENT_URL,
      debug: env.COPILOTKIT_DEBUG,
    }),
    wellness: new HttpAgent({
      url: env.WELLNESS_AGENT_URL,
      debug: env.COPILOTKIT_DEBUG,
    }),
    a2ui: new HttpAgent({
      url: env.A2UI_AGENT_URL,
      debug: env.COPILOTKIT_DEBUG,
    }),
  },
  beforeRequestMiddleware: async ({ request }) => {
    const { userId } = await auth();
    const { token: krogerToken } = await getKrogerAccessToken().catch(() => ({
      connected: false,
      token: null,
    }));
    const { token: stravaToken } = await getStravaAccessToken().catch((err) => {
      console.error("[copilotkit] getStravaAccessToken error:", err);
      return { connected: false, token: null };
    });

    console.log(
      `[copilotkit] building agents stravaTokenPresent=${Boolean(stravaToken)} krogerTokenPresent=${Boolean(krogerToken)}`,
    );

    const headers = new Headers(request.headers);
    if (userId) {
      headers.set(CLERK_USER_ID_HEADER, userId);
    }
    if (krogerToken) {
      headers.set(KROGER_TOKEN_HEADER, krogerToken);
    }
    if (stravaToken) {
      headers.set(STRAVA_TOKEN_HEADER, stravaToken);
    }

    return new Request(request, { headers });
  },
  a2ui: { injectA2UITool: true, agents: ["a2ui"] },
  debug: env.COPILOTKIT_DEBUG,
});

const handler = createCopilotRuntimeHandler({
  runtime,
  basePath: "/api/copilotkit",
  mode: "multi-route",
});

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
