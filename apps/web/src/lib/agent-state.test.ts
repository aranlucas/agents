import { describe, expect, it } from "vitest";

import {
  asDocStatus,
  isRecord,
  oneOf,
  toFitnessState,
  toGroceryState,
  toTripState,
  toWellnessState,
} from "./agent-state";

describe("isRecord", () => {
  it("accepts plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("rejects null, arrays, and primitives", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("x")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});

describe("oneOf", () => {
  const colors = ["red", "green", "blue"] as const;

  it("returns the value when allowed", () => {
    expect(oneOf("green", colors, "red")).toBe("green");
  });

  it("returns the fallback for disallowed or non-string values", () => {
    expect(oneOf("purple", colors, "red")).toBe("red");
    expect(oneOf(undefined, colors, "blue")).toBe("blue");
    expect(oneOf(123, colors, "blue")).toBe("blue");
  });
});

describe("asDocStatus", () => {
  it("passes through valid statuses", () => {
    expect(asDocStatus("booked")).toBe("booked");
    expect(asDocStatus("drafting")).toBe("drafting");
  });

  it("defaults unknown values to idle", () => {
    expect(asDocStatus("nonsense")).toBe("idle");
    expect(asDocStatus(undefined)).toBe("idle");
    expect(asDocStatus(null)).toBe("idle");
  });
});

describe("toTripState", () => {
  it("fills defaults from an empty/invalid input", () => {
    expect(toTripState(undefined)).toEqual({
      destination: "",
      start_date: "",
      end_date: "",
      travelers: 0,
      budget_usd: 0,
      headline: "",
      summary: "",
      itinerary: "",
      flights: "",
      status: "idle",
      review_summary: undefined,
    });
    // Non-object inputs are treated as empty.
    expect(toTripState("bogus").destination).toBe("");
    expect(toTripState(["bogus"]).travelers).toBe(0);
  });

  it("reads valid fields and ignores wrongly-typed ones", () => {
    const result = toTripState({
      destination: "Tokyo",
      travelers: 2,
      budget_usd: "not-a-number",
      status: "booked",
      review_summary: "looks good",
    });
    expect(result.destination).toBe("Tokyo");
    expect(result.travelers).toBe(2);
    expect(result.budget_usd).toBe(0);
    expect(result.status).toBe("booked");
    expect(result.review_summary).toBe("looks good");
  });

  it("drops non-finite numbers", () => {
    expect(toTripState({ travelers: Number.NaN }).travelers).toBe(0);
    expect(toTripState({ budget_usd: Infinity }).budget_usd).toBe(0);
  });
});

describe("toGroceryState", () => {
  it("coerces list and array members defensively", () => {
    const result = toGroceryState({
      shopping_list: ["milk", 5, "eggs"],
      cart: [{ name: "milk", quantity: 2, price: 3.5 }, "junk"],
      pantry: [{ name: "rice", quantity: "1kg" }],
      status: "ready",
      kroger_connected: true,
    });
    expect(result.shopping_list).toEqual(["milk", "eggs"]);
    expect(result.cart).toEqual([
      { name: "milk", quantity: 2, price: 3.5, upc: undefined },
      { name: "", quantity: 0, price: undefined, upc: undefined },
    ]);
    expect(result.pantry).toEqual([{ name: "rice", quantity: "1kg", expires: undefined }]);
    expect(result.status).toBe("ready");
    expect(result.kroger_connected).toBe(true);
  });

  it("defaults to empty collections", () => {
    const result = toGroceryState({});
    expect(result.shopping_list).toEqual([]);
    expect(result.cart).toEqual([]);
    expect(result.pantry).toEqual([]);
    expect(result.status).toBe("idle");
    expect(result.kroger_connected).toBe(false);
  });
});

describe("toFitnessState", () => {
  it("maps activities and coerces numbers", () => {
    const result = toFitnessState({
      strava_connected: true,
      activities: [{ id: "1", name: "Run", distance_m: 5000, average_heartrate: "bad" }],
      status: "syncing",
    });
    expect(result.strava_connected).toBe(true);
    expect(result.status).toBe("syncing");
    expect(result.activities).toEqual([
      {
        id: "1",
        name: "Run",
        sport_type: undefined,
        start_date: undefined,
        distance_m: 5000,
        moving_time_s: undefined,
        elapsed_time_s: undefined,
        total_elevation_gain_m: undefined,
        average_heartrate: undefined,
        perceived_effort: undefined,
      },
    ]);
  });
});

describe("toWellnessState", () => {
  it("keeps last_delegation only when it is an object", () => {
    expect(toWellnessState({ last_delegation: { a: 1 } }).last_delegation).toEqual({ a: 1 });
    expect(toWellnessState({ last_delegation: "x" }).last_delegation).toBeUndefined();
    expect(toWellnessState({ status: "planning" }).status).toBe("planning");
  });
});

describe("agent-state (no A2UI showcase)", () => {
  it("no longer exposes toA2UIState", async () => {
    // toA2UIState was removed with the standalone showcase; the module must no
    // longer export it. Import dynamically so the absence is a runtime fact,
    // not a compile error.
    const mod = (await import("./agent-state")) as Record<string, unknown>;
    expect(mod.toA2UIState).toBeUndefined();
  });
});
