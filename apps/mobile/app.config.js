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
      travelAgentUrl: envOrFallback("EXPO_PUBLIC_TRAVEL_AGENT_URL", baseExtra.travelAgentUrl),
      groceryAgentUrl: envOrFallback("EXPO_PUBLIC_GROCERY_AGENT_URL", baseExtra.groceryAgentUrl),
      fitnessAgentUrl: envOrFallback("EXPO_PUBLIC_FITNESS_AGENT_URL", baseExtra.fitnessAgentUrl),
      wellnessAgentUrl: envOrFallback("EXPO_PUBLIC_WELLNESS_AGENT_URL", baseExtra.wellnessAgentUrl),
      a2uiAgentUrl: envOrFallback("EXPO_PUBLIC_A2UI_AGENT_URL", baseExtra.a2uiAgentUrl),
    },
  };
};
