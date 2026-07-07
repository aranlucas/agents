import { describe, expect, it } from "vitest";

import { resolveAndroidSdkRoot, withAndroidSdkEnv } from "../scripts/android-sdk-env.mjs";

const existingPaths = (paths: string[]) => (path: string) => paths.includes(path);

describe("Android SDK environment", () => {
  it("prefers an existing ANDROID_HOME", () => {
    const sdkRoot = resolveAndroidSdkRoot({
      env: {
        ANDROID_HOME: "/opt/android-sdk",
        ANDROID_SDK_ROOT: "/other/android-sdk",
      },
      exists: existingPaths(["/opt/android-sdk", "/other/android-sdk"]),
      home: "/Users/tester",
    });

    expect(sdkRoot).toBe("/opt/android-sdk");
  });

  it("falls back to ANDROID_SDK_ROOT when ANDROID_HOME is unset", () => {
    const sdkRoot = resolveAndroidSdkRoot({
      env: {
        ANDROID_SDK_ROOT: "/other/android-sdk",
      },
      exists: existingPaths(["/other/android-sdk"]),
      home: "/Users/tester",
    });

    expect(sdkRoot).toBe("/other/android-sdk");
  });

  it("falls back to the default macOS Android SDK location", () => {
    const sdkRoot = resolveAndroidSdkRoot({
      env: {},
      exists: existingPaths(["/Users/tester/Library/Android/sdk"]),
      home: "/Users/tester",
    });

    expect(sdkRoot).toBe("/Users/tester/Library/Android/sdk");
  });

  it("sets both Android SDK variables for child processes", () => {
    const env = withAndroidSdkEnv({
      env: { PATH: "/bin" },
      exists: existingPaths(["/Users/tester/Library/Android/sdk"]),
      home: "/Users/tester",
    });

    expect(env).toMatchObject({
      PATH: "/bin",
      ANDROID_HOME: "/Users/tester/Library/Android/sdk",
      ANDROID_SDK_ROOT: "/Users/tester/Library/Android/sdk",
    });
  });

  it("throws with an actionable message when no SDK exists", () => {
    expect(() =>
      resolveAndroidSdkRoot({
        env: {},
        exists: () => false,
        home: "/Users/tester",
      }),
    ).toThrow(/Set ANDROID_HOME/);
  });
});
