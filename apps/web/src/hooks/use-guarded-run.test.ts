// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useGuardedRun } from "./use-guarded-run";

describe("useGuardedRun", () => {
  it("captures a rejection instead of throwing", async () => {
    const { result } = renderHook(() => useGuardedRun());
    const action = vi.fn().mockRejectedValue(new Error("agent unreachable"));

    await act(() => result.current.run(action));

    expect(result.current.error?.message).toBe("agent unreachable");
  });

  it("retries the last action and clears the error on success", async () => {
    const { result } = renderHook(() => useGuardedRun());
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined);

    await act(() => result.current.run(action));
    expect(result.current.error).not.toBeNull();

    await act(() => result.current.retry());

    expect(action).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBeNull();
  });

  it("retry is a no-op before any run", async () => {
    const { result } = renderHook(() => useGuardedRun());

    await act(() => result.current.retry());

    expect(result.current.error).toBeNull();
  });
});
