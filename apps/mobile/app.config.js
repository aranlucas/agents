const appJson = require("./app.json");

function envOrFallback(name, fallback) {
  return process.env[name] || fallback || "";
}

module.exports = ({ config }) => {
  const baseConfig = {
    ...appJson.expo,
    ...config,
  };
  const baseExtra = {
    ...appJson.expo.extra,
    ...config.extra,
  };

  return {
    ...baseConfig,
    extra: {
      ...baseExtra,
      clerkPublishableKey: envOrFallback(
        "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
        baseExtra.clerkPublishableKey,
      ),
      copilotKitRuntimeUrl: envOrFallback(
        "EXPO_PUBLIC_COPILOTKIT_RUNTIME_URL",
        baseExtra.copilotKitRuntimeUrl,
      ),
      agentsBaseUrl: envOrFallback("EXPO_PUBLIC_AGENTS_BASE_URL", baseExtra.agentsBaseUrl),
    },
  };
};
