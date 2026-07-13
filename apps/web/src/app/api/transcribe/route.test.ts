// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("serves the offline transcription fixture without constructing a runtime", async () => {
  vi.stubEnv("AGENT_TEST_MODE", "offline");
  const { POST } = await import("./route");
  const response = await POST(new Request("http://localhost/api/transcribe", { method: "POST" }));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ text: "Offline transcription is not available." });
});
