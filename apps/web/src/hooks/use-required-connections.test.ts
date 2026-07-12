import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ExternalAccountLike } from "@/lib/connections";

const clerk = vi.hoisted(() => ({
  isLoaded: true,
  user: null as null | {
    id: string;
    externalAccounts: ExternalAccountLike[];
    reload: () => Promise<void>;
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useUser: () => clerk,
}));

import { useRequiredConnections } from "./use-required-connections";

describe("useRequiredConnections", () => {
  beforeEach(() => {
    clerk.isLoaded = true;
    clerk.user = null;
  });

  it("refreshes Clerk before reporting a recently linked account as missing", async () => {
    const reload = vi.fn(async () => {
      if (!clerk.user) throw new Error("missing test user");
      clerk.user.externalAccounts = [
        { provider: "custom_strava", verification: { status: "verified" } },
      ];
    });
    clerk.user = { id: "user_123", externalAccounts: [], reload };

    const { result } = renderHook(() => useRequiredConnections("fitness"));

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current).toEqual({ isLoading: false, missing: [] }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("reports the missing provider if refreshing Clerk fails", async () => {
    const reload = vi.fn(async () => {
      throw new Error("Clerk unavailable");
    });
    clerk.user = { id: "user_123", externalAccounts: [], reload };

    const { result } = renderHook(() => useRequiredConnections("fitness"));

    await waitFor(() => expect(result.current).toEqual({ isLoading: false, missing: ["strava"] }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not refresh Clerk for agents without required accounts", () => {
    const reload = vi.fn(async () => undefined);
    clerk.user = { id: "user_123", externalAccounts: [], reload };

    const { result } = renderHook(() => useRequiredConnections("research"));

    expect(result.current).toEqual({ isLoading: false, missing: [] });
    expect(reload).not.toHaveBeenCalled();
  });

  it("does not report a missing account while Clerk is still hydrating the user", () => {
    const { result } = renderHook(() => useRequiredConnections("fitness"));

    expect(result.current).toEqual({ isLoading: true, missing: ["strava"] });
  });
});
