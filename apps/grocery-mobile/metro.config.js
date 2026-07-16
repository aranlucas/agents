const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// CopilotKit imports Node-only Segment telemetry; client bundles do not use it.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@segment/analytics-node") {
    return { type: "empty" };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  dtsFile: "./src/uniwind-types.d.ts",
  polyfills: {
    rem: 14,
  },
});
