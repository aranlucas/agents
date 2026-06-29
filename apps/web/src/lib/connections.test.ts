import { describe, expect, it } from "vitest";
import { missingProviders, type ExternalAccountLike } from "./connections";

const verified = (provider: string): ExternalAccountLike => ({
  provider,
  verification: { status: "verified" },
});

describe("missingProviders", () => {
  it("is empty when nothing is required", () => {
    expect(missingProviders([], [])).toEqual([]);
  });

  it("reports a required-but-unlinked provider", () => {
    expect(missingProviders(["strava"], [])).toEqual(["strava"]);
  });

  it("clears once the provider is verified (strava)", () => {
    expect(missingProviders(["strava"], [verified("custom_strava")])).toEqual([]);
    expect(missingProviders(["strava"], [verified("oauth_custom_strava")])).toEqual([]);
  });

  it("clears once the provider is verified (kroger)", () => {
    expect(missingProviders(["kroger"], [verified("custom_shopping")])).toEqual([]);
    expect(missingProviders(["kroger"], [verified("oauth_custom_shopping")])).toEqual([]);
  });

  it("ignores unverified accounts", () => {
    expect(
      missingProviders(
        ["strava"],
        [{ provider: "custom_strava", verification: { status: "unverified" } }],
      ),
    ).toEqual(["strava"]);
    expect(missingProviders(["strava"], [{ provider: "custom_strava" }])).toEqual(["strava"]);
  });

  it("reports both for wellness with neither linked", () => {
    expect(missingProviders(["kroger", "strava"], [])).toEqual(["kroger", "strava"]);
  });

  it("reports only the still-missing one (order follows required)", () => {
    expect(missingProviders(["kroger", "strava"], [verified("custom_shopping")])).toEqual([
      "strava",
    ]);
  });
});
