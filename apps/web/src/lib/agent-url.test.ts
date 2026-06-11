import { describe, expect, it } from "vitest";
import { agentAguiUrl, agentBaseUrl, agentHealthUrl } from "./agent-url";

describe("agent URL helpers", () => {
  it("builds endpoints from base URLs", () => {
    expect(agentBaseUrl("http://localhost:8005")).toBe("http://localhost:8005");
    expect(agentAguiUrl("http://localhost:8005")).toBe("http://localhost:8005/agui");
    expect(agentHealthUrl("http://localhost:8005")).toBe("http://localhost:8005/health");
  });

  it("normalizes URLs already pointing at /agui", () => {
    expect(agentBaseUrl("http://localhost:8005/agui")).toBe("http://localhost:8005");
    expect(agentAguiUrl("http://localhost:8005/agui")).toBe("http://localhost:8005/agui");
    expect(agentHealthUrl("http://localhost:8005/agui")).toBe("http://localhost:8005/health");
  });

  it("normalizes trailing slashes", () => {
    expect(agentBaseUrl("http://localhost:8005/agui/")).toBe("http://localhost:8005");
    expect(agentAguiUrl("http://localhost:8005/")).toBe("http://localhost:8005/agui");
    expect(agentHealthUrl("http://localhost:8005/")).toBe("http://localhost:8005/health");
  });
});
