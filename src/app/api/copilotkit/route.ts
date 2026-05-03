import {
  CopilotRuntime,
  createCopilotRuntimeHandler,
} from "@copilotkit/runtime/v2";
import { HttpAgent } from "@ag-ui/client";

const runtime = new CopilotRuntime({
  agents: {
    my_agent: new HttpAgent({
      url: process.env.AGENT_URL || "http://localhost:8000/",
      debug: process.env.COPILOTKIT_DEBUG !== "false",
    }),
  },
  debug: process.env.COPILOTKIT_DEBUG !== "false",
});

const handler = createCopilotRuntimeHandler({
  runtime,
  mode: "single-route",
  hooks: {
    onBeforeHandler: ({ route }) => {
      console.info("[copilotkit]", route);
    },
    onResponse: ({ route, response }) => {
      console.info("[copilotkit]", route, response.status);
    },
    onError: ({ route, error }) => {
      console.error("[copilotkit]", route ?? "unrouted", error);
    },
  },
});

export const POST = handler;
