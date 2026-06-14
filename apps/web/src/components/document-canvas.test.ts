import { describe, expect, it } from "vitest";
import { daysBetween, fmtDate, fmtDateRange, parseItinerary } from "./document-canvas";

describe("parseItinerary", () => {
  it("returns empty when input is blank", () => {
    expect(parseItinerary("")).toEqual({ days: [], trailing: "" });
    expect(parseItinerary("   ")).toEqual({ days: [], trailing: "" });
  });

  it("parses a single day with bullet activities", () => {
    const raw = "## Day 1: Arrival\n- Land at airport\n- Check in";
    const { days, trailing } = parseItinerary(raw);
    expect(days).toHaveLength(1);
    expect(days[0]).toEqual({
      day: 1,
      theme: "Arrival",
      activities: ["Land at airport", "Check in"],
    });
    expect(trailing).toBe("");
  });

  it("parses multiple days", () => {
    const raw =
      "## Day 1: Arrival\n- Land\n## Day 2: Markets\n- Nishiki\n- Ramen";
    const { days } = parseItinerary(raw);
    expect(days).toHaveLength(2);
    expect(days[1].theme).toBe("Markets");
    expect(days[1].activities).toEqual(["Nishiki", "Ramen"]);
  });

  it("captures preamble text before the first day header as trailing", () => {
    const raw = "Intro line\nAnother line\n## Day 1: Arrival\n- Land";
    const { trailing } = parseItinerary(raw);
    expect(trailing).toBe("Intro line Another line");
  });

  it("accepts em-dash and en-dash separators in day headers", () => {
    const { days: a } = parseItinerary("## Day 1 — Theme");
    const { days: b } = parseItinerary("## Day 2 – Theme");
    const { days: c } = parseItinerary("## Day 3 - Theme");
    expect(a[0].theme).toBe("Theme");
    expect(b[0].theme).toBe("Theme");
    expect(c[0].theme).toBe("Theme");
  });

  it("accepts * and • bullets as well as -", () => {
    const raw = "## Day 1: Test\n* Star bullet\n• Dot bullet";
    const { days } = parseItinerary(raw);
    expect(days[0].activities).toEqual(["Star bullet", "Dot bullet"]);
  });

  it("treats non-bullet lines inside a day as free-form activities", () => {
    const raw = "## Day 1: Arrival\nFree text line";
    const { days } = parseItinerary(raw);
    expect(days[0].activities).toEqual(["Free text line"]);
  });

  it("returns an empty activities list for a day with no content", () => {
    const raw = "## Day 1: Empty";
    const { days } = parseItinerary(raw);
    expect(days[0].activities).toEqual([]);
  });
});

describe("fmtDate", () => {
  it("returns empty string for empty input", () => {
    expect(fmtDate("")).toBe("");
  });

  it("returns the input unchanged for invalid dates", () => {
    expect(fmtDate("bad-date")).toBe("bad-date");
  });

  it("formats a valid ISO date as a non-empty localized string", () => {
    // fmtDate uses toLocaleDateString; don't assert the exact output since it
    // varies by locale and timezone. Just verify it returns something formatted.
    const result = fmtDate("2026-06-15");
    expect(result).not.toBe("");
    expect(result).not.toBe("2026-06-15"); // not the raw ISO string
  });
});

describe("fmtDateRange", () => {
  it("returns empty string when both are empty", () => {
    expect(fmtDateRange("", "")).toBe("");
  });

  it("returns just the start date when end is empty", () => {
    const result = fmtDateRange("2026-10-15", "");
    expect(result).toMatch(/Oct/);
    expect(result).not.toContain("→");
  });

  it("returns a range with arrow when both dates are valid", () => {
    const result = fmtDateRange("2026-10-01", "2026-10-07");
    expect(result).toContain("→");
  });
});

describe("daysBetween", () => {
  it("returns 0 when either date is missing", () => {
    expect(daysBetween("", "2026-10-07")).toBe(0);
    expect(daysBetween("2026-10-01", "")).toBe(0);
  });

  it("returns 0 for invalid dates", () => {
    expect(daysBetween("bad", "2026-10-07")).toBe(0);
  });

  it("counts inclusive days", () => {
    // Oct 1 → Oct 7 = 7 days inclusive
    expect(daysBetween("2026-10-01", "2026-10-07")).toBe(7);
  });

  it("returns 1 for a single day", () => {
    expect(daysBetween("2026-10-01", "2026-10-01")).toBe(1);
  });

  it("returns 0 when end is before start", () => {
    expect(daysBetween("2026-10-07", "2026-10-01")).toBe(0);
  });
});
