// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function readBody(response: Response): Promise<string> {
  return response.text();
}

describe("offline CopilotKit route handlers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AGENT_TEST_MODE", "offline");
    vi.stubEnv("NEXT_PUBLIC_AGENT_TEST_MODE", "offline");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves the deployed source-of-truth info response without keys", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/copilotkit/info"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      version: "1.61.0",
      mode: "sse",
      a2uiEnabled: true,
      a2ui: { enabled: true, agents: ["trends"] },
      agents: {
        travel: { name: "travel", description: "", className: "ox" },
        resume: { name: "resume", description: "", className: "ox" },
      },
    });
  });

  it("streams a deterministic local agent run without auth or remote APIs", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/copilotkit/agent/travel/run", { method: "POST" }),
    );
    const body = await readBody(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('"type":"RUN_STARTED"');
    expect(body).toContain('"type":"TEXT_MESSAGE_CONTENT"');
    expect(body).toContain("Offline travel agent mock is running");
    expect(body).toContain('"type":"RUN_FINISHED"');
  });

  it("serves an offline transcription response without Groq", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/copilotkit/transcribe", { method: "POST" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: "Offline transcription is not available." });
  });
});
