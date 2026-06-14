import { describe, expect, it } from "vitest";

import { tabForStatus } from "./tab-for-status";

describe("tabForStatus", () => {
  it("maps questioning to the question tab", () => {
    expect(tabForStatus("questioning")).toBe("question");
  });
  it("maps feedback and complete to the feedback tab", () => {
    expect(tabForStatus("feedback")).toBe("feedback");
    expect(tabForStatus("complete")).toBe("feedback");
  });
  it("defaults idle/presenting/undefined to the question tab", () => {
    expect(tabForStatus("idle")).toBe("question");
    expect(tabForStatus("presenting")).toBe("question");
    expect(tabForStatus(undefined)).toBe("question");
  });
});
