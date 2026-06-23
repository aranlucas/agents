import { describe, expect, it } from "vitest";
import { buildLinePoints, formatTrendValue, selectBarRows } from "./catalog-data";

describe("Trends catalog data helpers", () => {
  it("selects only finite numeric bar values and respects maxItems", () => {
    expect(
      selectBarRows(
        [
          { term: "python", score: 100 },
          { term: "typescript", score: 80 },
          { term: "invalid", score: "high" },
        ],
        "term",
        "score",
        1,
      ),
    ).toEqual([{ label: "python", value: 100 }]);
  });

  it("builds stable SVG line points", () => {
    expect(
      buildLinePoints(
        [
          { week: "2026-06-01", score: 25 },
          { week: "2026-06-08", score: 75 },
        ],
        "week",
        "score",
      ),
    ).toEqual([
      { label: "2026-06-01", value: 25, x: 0, y: 100 },
      { label: "2026-06-08", value: 75, x: 100, y: 0 },
    ]);
  });

  it("formats percent, number, date, null, and text values", () => {
    expect(formatTrendValue(1250, "percent")).toBe("1,250%");
    expect(formatTrendValue(1200, "number")).toBe("1,200");
    expect(formatTrendValue("2026-06-22", "date")).toContain("Jun");
    expect(formatTrendValue(null, "text")).toBe("—");
    expect(formatTrendValue("python", "text")).toBe("python");
  });
});
