const appJson = require("./app.json");

function envOrFallback(name, fallback) {
  // eslint-disable-next-line typescript/prefer-nullish-coalescing
  return process.env[name] || fallback || "";
}

function shouldUseStaticWebOutputForNativeBuild() {
  return ["android", "ios"].includes(process.env.EAS_BUILD_PLATFORM);
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
    web: {
      ...baseConfig.web,
      output: shouldUseStaticWebOutputForNativeBuild() ? "static" : baseConfig.web?.output,
    },
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
