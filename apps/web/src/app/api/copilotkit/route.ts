import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

const runtime = new CopilotRuntime({
  agents: {
    travel: new HttpAgent({
      url: process.env.TRAVEL_AGENT_URL || "http://localhost:8000/",
      debug: process.env.COPILOTKIT_DEBUG !== "false",
    }),
    grocery: new HttpAgent({
      url: process.env.GROCERY_AGENT_URL || "http://localhost:8001/",
      debug: process.env.COPILOTKIT_DEBUG !== "false",
    }),
  },
  debug: process.env.COPILOTKIT_DEBUG !== "false",
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
