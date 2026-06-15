import { describe, expect, it, vi } from "vitest";

vi.mock("@copilotkit/runtime/v2", () => ({
  CopilotSseRuntime: class CopilotSseRuntime {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
  createCopilotRuntimeHandler: (config: {
    hooks?: { onRequest?: (event: { request: Request }) => Promise<void> };
  }) =>
    vi.fn(async (request: Request) => {
      await config.hooks?.onRequest?.({ request });
      return new Response("ok");
    }),
  TranscriptionService: class TranscriptionService {
    constructor() {
      if (new.target === TranscriptionService) {
        throw new TypeError("TranscriptionService is abstract");
      }
    }
    async transcribeFile() {
      return "";
    }
  },
}));

vi.mock("@ag-ui/client", () => ({
  HttpAgent: class HttpAgent {
    config: unknown;
    constructor(config: unknown) {
      this.config = config;
    }
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_123", getToken: vi.fn(async () => "session-jwt") })),
}));

vi.mock("@/env", () => ({
  env: {
    CLERK_SECRET_KEY: "secret",
    AGENTS_BASE_URL: "http://agents.test",
    COPILOTKIT_DEBUG: false,
  },
}));

vi.mock("@/lib/agent-url", () => ({
  agentBaseUrl: vi.fn(() => "http://agents.test"),
}));

vi.mock("@/lib/kroger-token", () => ({
  getKrogerAccessToken: vi.fn(async () => ({ connected: false, token: null })),
}));

vi.mock("@/lib/strava-token", () => ({
  getStravaAccessToken: vi.fn(async () => ({ connected: false, token: null })),
}));

vi.mock("@/components/chat/agents/registry", () => ({
  AGENT_BACKEND_PATHS: { travel: "travel" },
  AGENT_ORDER: ["travel"],
}));

vi.mock("./guard", () => ({
  isPublicCopilotPath: vi.fn(() => false),
}));

import { GET, POST, PATCH, DELETE, OPTIONS } from "./route";

describe("CopilotKit route handlers", () => {
  const request = new Request("http://localhost/travel");

  it("GET returns a response", async () => {
    const res = await GET(request);
    expect(res).toBeInstanceOf(Response);
  });

  it("POST returns a response", async () => {
    const res = await POST(request);
    expect(res).toBeInstanceOf(Response);
  });

  it("PATCH returns a response", async () => {
    const res = await PATCH(request);
    expect(res).toBeInstanceOf(Response);
  });

  it("DELETE returns a response", async () => {
    const res = await DELETE(request);
    expect(res).toBeInstanceOf(Response);
  });

  it("OPTIONS returns a response", async () => {
    const res = await OPTIONS(request);
    expect(res).toBeInstanceOf(Response);
  });
});
