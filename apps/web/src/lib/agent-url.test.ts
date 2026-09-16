import { describe, expect, it } from "vitest";
import { agentBaseUrl } from "./agent-url";

describe("agent URL helpers", () => {
  it("returns the base URL unchanged when it has no suffix", () => {
    expect(agentBaseUrl("http://localhost:8005")).toBe("http://localhost:8005");
  });

  it("strips a trailing /agui path", () => {
    expect(agentBaseUrl("http://localhost:8005/agui")).toBe("http://localhost:8005");
  });

  it("strips trailing slashes and a trailing /agui path", () => {
    expect(agentBaseUrl("http://localhost:8005/agui/")).toBe("http://localhost:8005");
  });
});
