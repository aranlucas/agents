import { describe, expect, it } from "vitest";
import { connectedProviders, missingProviders, type ExternalAccountLike } from "./connections";

const verified = (provider: string): ExternalAccountLike => ({
  provider,
  verification: { status: "verified" },
});

describe("connectedProviders", () => {
  it("returns nothing for no accounts", () => {
    expect(connectedProviders([])).toEqual([]);
  });

  it("matches strava under either clerk spelling", () => {
    expect(connectedProviders([verified("custom_strava")])).toEqual(["strava"]);
    expect(connectedProviders([verified("oauth_custom_strava")])).toEqual(["strava"]);
  });

  it("matches kroger under either clerk spelling", () => {
    expect(connectedProviders([verified("custom_shopping")])).toEqual(["kroger"]);
    expect(connectedProviders([verified("oauth_custom_shopping")])).toEqual(["kroger"]);
  });

  it("ignores unverified accounts", () => {
    expect(
      connectedProviders([{ provider: "custom_strava", verification: { status: "unverified" } }]),
    ).toEqual([]);
    expect(connectedProviders([{ provider: "custom_strava" }])).toEqual([]);
  });
});

describe("missingProviders", () => {
  it("is empty when nothing is required", () => {
    expect(missingProviders([], [])).toEqual([]);
  });

  it("reports a required-but-unlinked provider", () => {
    expect(missingProviders(["strava"], [])).toEqual(["strava"]);
  });

  it("clears once the provider is verified", () => {
    expect(missingProviders(["strava"], [verified("custom_strava")])).toEqual([]);
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
