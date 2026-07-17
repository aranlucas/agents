import { describe, expect, it, vi } from "vitest";
import {
  hasKrogerConnection,
  isKrogerConnection,
  KROGER_CALLBACK_DELAYS_MS,
  rotatingTokenNonceFromCallback,
  waitForKrogerConnection,
} from "@/lib/connections";

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

describe("waitForKrogerConnection", () => {
  it("preserves all five callback delays and can succeed on the final reload", async () => {
    const waits: number[] = [];
    const waitForDelay = vi.fn(async (delay: number) => {
      waits.push(delay);
    });
    let attempts = 0;
    const reload = vi.fn(async () => ({
      externalAccounts: [
        {
          provider: "oauth_custom_shopping",
          verification: { status: ++attempts === 5 ? "verified" : "unverified" },
        },
      ],
    }));

    const user = await waitForKrogerConnection({ reload, waitForDelay });

    expect(user.externalAccounts[0]?.verification?.status).toBe("verified");
    expect(waits).toEqual([...KROGER_CALLBACK_DELAYS_MS]);
    expect(reload).toHaveBeenCalledTimes(5);
  });

  it("fails only after all five unverified reloads", async () => {
    const reload = vi.fn(async () => ({
      externalAccounts: [
        { provider: "oauth_custom_shopping", verification: { status: "unverified" } },
      ],
    }));

    await expect(
      waitForKrogerConnection({ reload, waitForDelay: async () => undefined }),
    ).rejects.toThrow("Kroger returned without completing the account connection.");
    expect(reload).toHaveBeenCalledTimes(5);
  });

  it("propagates a reload failure immediately", async () => {
    const failure = new Error("reload failed");
    const reload = vi.fn().mockRejectedValue(failure);

    await expect(
      waitForKrogerConnection({ reload, waitForDelay: async () => undefined }),
    ).rejects.toBe(failure);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("stops before reloading when the callback wait is aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("route closed"));
    const reload = vi.fn();

    await expect(waitForKrogerConnection({ reload, signal: controller.signal })).rejects.toThrow(
      "route closed",
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
