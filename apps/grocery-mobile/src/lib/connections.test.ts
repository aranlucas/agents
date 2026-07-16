import { describe, expect, it } from "vitest";
import {
  hasKrogerConnection,
  isKrogerConnection,
  rotatingTokenNonceFromCallback,
} from "./connections";

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

  it("identifies both Clerk aliases for reconnecting", () => {
    expect(isKrogerConnection({ provider: "custom_shopping" })).toBe(true);
    expect(isKrogerConnection({ provider: "oauth_custom_shopping" })).toBe(true);
    expect(isKrogerConnection({ provider: "oauth_google" })).toBe(false);
  });

  it("reads Clerk's rotating nonce from the native OAuth callback", () => {
    expect(
      rotatingTokenNonceFromCallback(
        "grocery-agent://kroger-callback?rotating_token_nonce=nonce_123&other=value",
      ),
    ).toBe("nonce_123");
    expect(rotatingTokenNonceFromCallback("grocery-agent://kroger-callback")).toBe("");
  });
});
