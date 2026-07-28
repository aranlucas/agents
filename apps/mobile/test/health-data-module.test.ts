import { beforeEach, describe, expect, it, vi } from "vitest";

const requireOptionalNativeModule = vi.hoisted(() => vi.fn());

vi.mock("expo", () => ({ requireOptionalNativeModule }));

describe("HealthData module bridge", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOptionalNativeModule.mockReset();
  });

  it("provides an unavailable fallback when iOS has no native HealthData module", async () => {
    requireOptionalNativeModule.mockReturnValue(null);

    const { default: healthData } = await import("../modules/health-data");

    expect(requireOptionalNativeModule).toHaveBeenCalledWith("HealthData");
    await expect(healthData.getAvailabilityAsync()).resolves.toEqual({
      status: "unavailable",
      providerPackage: "",
    });
    await expect(healthData.getPermissionStatusAsync()).resolves.toEqual({
      granted: false,
      grantedPermissions: [],
      requiredPermissions: [],
    });
    await expect(healthData.requestPermissionsAsync()).resolves.toEqual({
      granted: false,
      grantedPermissions: [],
      requiredPermissions: [],
    });
    await expect(
      healthData.readActivitiesAsync(
        "2026-07-01T00:00:00.000Z",
        "2026-07-02T00:00:00.000Z",
        null,
        100,
      ),
    ).resolves.toEqual({ activities: [] });
  });

  it("uses the registered Android HealthData module unchanged", async () => {
    const nativeModule = {
      getAvailabilityAsync: vi.fn(),
      getPermissionStatusAsync: vi.fn(),
      requestPermissionsAsync: vi.fn(),
      readActivitiesAsync: vi.fn(),
    };
    requireOptionalNativeModule.mockReturnValue(nativeModule);

    const { default: healthData } = await import("../modules/health-data");

    expect(healthData).toBe(nativeModule);
  });
});
