import { describe, expect, it } from "vitest";
import { toToolState } from "./tool-adapter";

describe("toToolState", () => {
  it("maps CopilotKit statuses to ai-elements tool states", () => {
    expect(toToolState("inProgress")).toBe("input-streaming");
    expect(toToolState("executing")).toBe("input-available");
    expect(toToolState("complete")).toBe("output-available");
  });

  it("maps a completed call with an error to output-error", () => {
    expect(toToolState("complete", true)).toBe("output-error");
  });

  it("ignores the error flag until complete", () => {
    expect(toToolState("executing", true)).toBe("input-available");
  });
});
