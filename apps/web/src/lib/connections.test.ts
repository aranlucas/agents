import { describe, expect, it } from "vitest";
import { hasKrogerConnection, type ExternalAccountLike } from "./connections";

const verified = (provider: string): ExternalAccountLike => ({
  provider,
  verification: { status: "verified" },
});

describe("hasKrogerConnection", () => {
  it("recognizes both verified Kroger provider names", () => {
    expect(hasKrogerConnection([verified("custom_shopping")])).toBe(true);
    expect(hasKrogerConnection([verified("oauth_custom_shopping")])).toBe(true);
  });

  it("ignores unverified accounts", () => {
    expect(
      hasKrogerConnection([
        { provider: "custom_shopping", verification: { status: "unverified" } },
      ]),
    ).toBe(false);
    expect(hasKrogerConnection([{ provider: "custom_shopping" }])).toBe(false);
  });
});
