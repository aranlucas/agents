// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("offline AG-UI fixture transport", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("AGENT_TEST_MODE", "offline");
    vi.stubEnv("NEXT_PUBLIC_AGENT_TEST_MODE", "offline");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("serves deterministic info and agent streams", async () => {
    const { GET, POST } = await import("./route");
    const info = await GET(new Request("http://localhost/api/offline-copilotkit/info"));
    const run = await POST(
      new Request("http://localhost/api/offline-copilotkit/agent/travel/run", {
        method: "POST",
      }),
    );

    expect(info.status).toBe(200);
    expect(await info.json()).toMatchObject({ a2uiEnabled: false });
    expect(run.headers.get("content-type")).toContain("text/event-stream");
    expect(await run.text()).toContain("Offline travel agent mock is running");
  });
});
