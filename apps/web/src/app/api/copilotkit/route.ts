import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";
import { auth } from "@clerk/nextjs/server";
import { env } from "@/env";
import { getKrogerAccessToken } from "@/lib/kroger-token";
import { getStravaAccessToken } from "@/lib/strava-token";

const CLERK_USER_ID_HEADER = "x-clerk-user-id";
const KROGER_TOKEN_HEADER = "x-kroger-access-token";
const STRAVA_TOKEN_HEADER = "x-strava-access-token";

const runtime = new CopilotRuntime({
  agents: async () => {
    const { userId } = await auth();
    const identityHeaders: Record<string, string> = userId
      ? { [CLERK_USER_ID_HEADER]: userId }
      : {};
    const { token: krogerToken } = await getKrogerAccessToken().catch(() => ({
      connected: false,
      token: null,
    }));
    const { token: stravaToken } = await getStravaAccessToken().catch(
      (err) => {
        console.error("[copilotkit] getStravaAccessToken error:", err);
        return { connected: false, token: null };
      },
    );

    console.log(
      `[copilotkit] building agents stravaTokenPresent=${Boolean(stravaToken)} krogerTokenPresent=${Boolean(krogerToken)}`,
    );

    return {
      travel: new HttpAgent({
        url: env.TRAVEL_AGENT_URL,
        debug: env.COPILOTKIT_DEBUG,
        headers: identityHeaders,
      }),
      grocery: new HttpAgent({
        url: env.GROCERY_AGENT_URL,
        debug: env.COPILOTKIT_DEBUG,
        headers: {
          ...identityHeaders,
          ...(krogerToken ? { [KROGER_TOKEN_HEADER]: krogerToken } : {}),
        },
      }),
      fitness: new HttpAgent({
        url: env.FITNESS_AGENT_URL,
        debug: env.COPILOTKIT_DEBUG,
        headers: {
          ...identityHeaders,
          ...(stravaToken ? { [STRAVA_TOKEN_HEADER]: stravaToken } : {}),
        },
      }),
      wellness: new HttpAgent({
        url: env.WELLNESS_AGENT_URL,
        debug: env.COPILOTKIT_DEBUG,
        headers: identityHeaders,
      }),
    };
  },
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
