import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";
import { env } from "@/env";

const runtime = new CopilotRuntime({
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
