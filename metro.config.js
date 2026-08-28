const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Node-only packages pulled in by CopilotKit that should never run on native.
const NODE_ONLY_STUBS = new Set([
  "@segment/analytics-node",
  "node:buffer",
  "node:crypto",
  "node:events",
  "node:stream",
  "node:util",
]);

const innerResolveRequest = config.resolver?.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
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

module.exports = config;
