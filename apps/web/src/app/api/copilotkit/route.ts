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
      url: `${env.TRAVEL_AGENT_URL}/agui`,
      debug: env.COPILOTKIT_DEBUG,
    }),
    grocery: new HttpAgent({
      url: `${env.GROCERY_AGENT_URL}/agui`,
      debug: env.COPILOTKIT_DEBUG,
    }),
    fitness: new HttpAgent({
      url: `${env.FITNESS_AGENT_URL}/agui`,
      debug: env.COPILOTKIT_DEBUG,
    }),
    wellness: new HttpAgent({
      url: `${env.WELLNESS_AGENT_URL}/agui`,
      debug: env.COPILOTKIT_DEBUG,
    }),
    a2ui: new HttpAgent({
      url: `${env.A2UI_AGENT_URL}/agui`,
      debug: env.COPILOTKIT_DEBUG,
    }),
  },
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

      if (userId) {
        request.headers.set(CLERK_USER_ID_HEADER, userId);
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

export const GET = handler;
export const POST = handler;
export const OPTIONS = handler;
export const PATCH = handler;
export const DELETE = handler;
