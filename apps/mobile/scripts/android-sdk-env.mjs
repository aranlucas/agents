import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const defaultMacOsSdkRoot = (home) => join(home, "Library", "Android", "sdk");

const unique = (values) => [...new Set(values.filter(Boolean))];

export function resolveAndroidSdkRoot({
  env = process.env,
  exists = existsSync,
  home = homedir(),
} = {}) {
  const fallbackSdkRoot = defaultMacOsSdkRoot(home);
  const candidates = unique([env.ANDROID_HOME, env.ANDROID_SDK_ROOT, fallbackSdkRoot]);
  const sdkRoot = candidates.find((candidate) => exists(candidate));

  if (!sdkRoot) {
    throw new Error(
      `Android SDK location not found. Set ANDROID_HOME or install the SDK at ${fallbackSdkRoot}. Checked: ${candidates.join(", ")}`,
    );
  }

  return sdkRoot;
}

export function withAndroidSdkEnv(options = {}) {
  const env = options.env ?? process.env;
  const sdkRoot = resolveAndroidSdkRoot({ ...options, env });

  return {
    ...env,
    ANDROID_HOME: sdkRoot,
    ANDROID_SDK_ROOT: sdkRoot,
  };
}
