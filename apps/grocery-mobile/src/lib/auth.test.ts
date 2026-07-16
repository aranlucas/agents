import { describe, expect, it, vi } from "vitest";
import { readableError, runAuthenticated } from "./auth";

describe("runAuthenticated", () => {
  it("refreshes Clerk auth before starting a run", async () => {
    const setHeaders = vi.fn();
    const run = vi.fn(async () => "done");
    const result = await runAuthenticated({
      transport: { headers: { "x-existing": "yes" }, setHeaders },
      getToken: async () => "fresh-token",
      userId: "user_123",
      run,
    });

    expect(result).toBe("done");
    expect(setHeaders).toHaveBeenCalledWith({
      "x-existing": "yes",
      Authorization: "Bearer fresh-token",
      "x-clerk-user-id": "user_123",
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not run without an authenticated token", async () => {
    const run = vi.fn();
    await expect(
      runAuthenticated({
        transport: { headers: {}, setHeaders: vi.fn() },
        getToken: async () => null,
        userId: "user_123",
        run,
      }),
    ).rejects.toThrow("refresh your session");
    expect(run).not.toHaveBeenCalled();
  });
});

describe("readableError", () => {
  it("uses Clerk's detailed error message", () => {
    expect(readableError({ errors: [{ longMessage: "That password is incorrect." }] })).toBe(
      "That password is incorrect.",
    );
  });
});
