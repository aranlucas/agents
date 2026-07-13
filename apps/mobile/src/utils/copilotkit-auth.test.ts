import { describe, expect, it, vi } from "vitest";
import { runWithCurrentClerkToken } from "./copilotkit-auth";

describe("runWithCurrentClerkToken", () => {
  it("refreshes Clerk auth before starting every agent run", async () => {
    const calls: string[] = [];
    const setHeaders = vi.fn((headers: Record<string, string | null | undefined>) => {
      calls.push(`headers:${headers.Authorization}:${headers["x-clerk-user-id"]}`);
    });
    const getToken = vi.fn(async () => {
      calls.push("token");
      return "fresh-session-jwt";
    });
    const run = vi.fn(async () => {
      calls.push("run");
      return "complete";
    });

    const result = await runWithCurrentClerkToken({
      copilotkit: {
        headers: { "x-client-version": "1" },
        setHeaders,
      },
      getToken,
      userId: "user_123",
      run,
    });

    expect(result).toBe("complete");
    expect(setHeaders).toHaveBeenCalledWith({
      "x-client-version": "1",
      Authorization: "Bearer fresh-session-jwt",
      "x-clerk-user-id": "user_123",
    });
    expect(calls).toEqual(["token", "headers:Bearer fresh-session-jwt:user_123", "run"]);
  });

  it("clears stale identity headers when Clerk has no active token", async () => {
    const setHeaders = vi.fn();
    const run = vi.fn(async () => undefined);

    await runWithCurrentClerkToken({
      copilotkit: {
        headers: {
          Authorization: "Bearer expired",
          "x-clerk-user-id": "user_old",
          "x-client-version": "1",
        },
        setHeaders,
      },
      getToken: async () => null,
      userId: null,
      run,
    });

    expect(setHeaders).toHaveBeenCalledWith({
      Authorization: undefined,
      "x-clerk-user-id": undefined,
      "x-client-version": "1",
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not start a run when Clerk cannot refresh the session", async () => {
    const setHeaders = vi.fn();
    const run = vi.fn(async () => undefined);

    await expect(
      runWithCurrentClerkToken({
        copilotkit: { headers: {}, setHeaders },
        getToken: async () => {
          throw new Error("session refresh failed");
        },
        userId: "user_123",
        run,
      }),
    ).rejects.toThrow("session refresh failed");

    expect(setHeaders).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
