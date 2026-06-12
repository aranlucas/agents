const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Node-only packages pulled in by CopilotKit's server-side telemetry and
// @ag-ui/client transitive deps that should never run on native.
const NODE_ONLY_STUBS = new Set([
  "@segment/analytics-node",
  "node:buffer",
  "node:crypto",
  "node:events",
  "node:stream",
  "node:util",
]);

// Apply uniwind first so we can compose our resolver on top of whatever it sets.
const finalConfig = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  debug: true,
});

const innerResolveRequest = finalConfig.resolver?.resolveRequest;

finalConfig.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    ["@expo/ui/swift-ui", "@expo/ui/swift-ui/modifiers"].includes(moduleName)
  ) {
    return { type: "empty" };
  }
  // @legendapp/list ships no "." export; redirect bare import to the RN subpath.
  if (moduleName === "@legendapp/list") {
    return context.resolveRequest(context, "@legendapp/list/react-native", platform);
  }
  if (moduleName === "crypto" || moduleName === "node:crypto") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "src/shims/node-crypto.ts"),
    };
  }
  if (platform !== "web" && NODE_ONLY_STUBS.has(moduleName)) {
    return { type: "empty" };
  }
  if (innerResolveRequest) {
    return innerResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = finalConfig;
