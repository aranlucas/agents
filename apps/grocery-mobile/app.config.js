const appJson = require("./app.json");
const fs = require("node:fs");
const path = require("node:path");

function readLocalRootEnv() {
  if (process.env.EAS_BUILD || process.env.CI) return {};

  try {
    const contents = fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf8");
    return Object.fromEntries(
      contents
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const separator = line.indexOf("=");
          const key = line.slice(0, separator).trim();
          const rawValue = line.slice(separator + 1).trim();
          const value = rawValue.replace(/^(['"])(.*)\1$/u, "$2");
          return [key, value];
        }),
    );
  } catch {
    return {};
  }
}

function envOrFallback(name, fallback) {
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  return process.env[name] || fallback || "";
}

function runtimeUrlForKey(clerkPublishableKey, productionRuntimeUrl) {
  return clerkPublishableKey.startsWith("pk_test_")
    ? "https://agents-gateway-development.up.railway.app"
    : productionRuntimeUrl;
}

function configure({ config }) {
  const localRootEnv = readLocalRootEnv();
  const baseConfig = {
    ...appJson.expo,
    ...config,
  };
  const baseExtra = {
    ...appJson.expo.extra,
    ...config.extra,
  };
  const clerkPublishableKey = envOrFallback(
    "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
    localRootEnv.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || baseExtra.clerkPublishableKey,
  );
  const localRuntimeUrl = runtimeUrlForKey(clerkPublishableKey, baseExtra.copilotKitRuntimeUrl);

  return {
    ...baseConfig,
    extra: {
      ...baseExtra,
      clerkPublishableKey,
      copilotKitRuntimeUrl: envOrFallback("EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL", localRuntimeUrl),
      marketingBaseUrl: envOrFallback(
        "EXPO_PUBLIC_GROCERY_MARKETING_URL",
        baseExtra.marketingBaseUrl,
      ),
    },
  };
}

module.exports = configure;
module.exports.runtimeUrlForKey = runtimeUrlForKey;
