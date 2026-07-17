import { describe, expect, it } from "vitest";
import { buildReportMailto } from "@/lib/report";

describe("buildReportMailto", () => {
  it("creates an encoded, reviewable support email", () => {
    const result = buildReportMailto({
      category: "Wrong item",
      details: "The milk match was wrong",
      userId: "user_123",
    });
    expect(result).toMatch(/^mailto:aranlucas@gmail\.com\?/u);
    expect(decodeURIComponent(result)).toContain("Grocery Agent report: Wrong item");
    expect(decodeURIComponent(result)).toContain("User reference: user_123");
  });
});
