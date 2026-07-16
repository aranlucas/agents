import { describe, expect, it } from "vitest";
import { hasKrogerConnection } from "./connections";

describe("hasKrogerConnection", () => {
  it("accepts both verified Clerk provider names", () => {
    expect(
      hasKrogerConnection([{ provider: "custom_shopping", verification: { status: "verified" } }]),
    ).toBe(true);
    expect(
      hasKrogerConnection([
        { provider: "oauth_custom_shopping", verification: { status: "verified" } },
      ]),
    ).toBe(true);
  });

  it("rejects an unverified or unrelated account", () => {
    expect(
      hasKrogerConnection([
        { provider: "custom_shopping", verification: { status: "unverified" } },
        { provider: "oauth_google", verification: { status: "verified" } },
      ]),
    ).toBe(false);
  });
});
