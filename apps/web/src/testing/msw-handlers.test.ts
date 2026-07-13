// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { OFFLINE_AGENT_HEALTH_RESPONSE, OFFLINE_COPILOTKIT_INFO_RESPONSE } from "./msw-handlers";
import { offlineApiMockServer } from "./offline-server";

describe("offline API MSW handlers", () => {
  beforeAll(() => {
    offlineApiMockServer.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    offlineApiMockServer.resetHandlers();
  });

  afterAll(() => {
    offlineApiMockServer.close();
  });

  it("mocks the deployed source-of-truth health response", async () => {
    const response = await fetch("https://agents-lucas.vercel.app/api/agents/health");

    expect(await response.json()).toEqual(OFFLINE_AGENT_HEALTH_RESPONSE);
  });

  it("mocks the deployed source-of-truth CopilotKit info response", async () => {
    const response = await fetch("https://agents-lucas.vercel.app/api/offline-copilotkit/info");

    expect(await response.json()).toEqual(OFFLINE_COPILOTKIT_INFO_RESPONSE);
  });
});
