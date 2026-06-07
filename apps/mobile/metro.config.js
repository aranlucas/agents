const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    platform === "web" &&
    ["@expo/ui/swift-ui", "@expo/ui/swift-ui/modifiers"].includes(moduleName)
  ) {
    return {
      type: "empty",
    };
  }
  // @legendapp/list ships no "." export; redirect bare import to the RN subpath.
  if (moduleName === "@legendapp/list") {
    return context.resolveRequest(context, "@legendapp/list/react-native", platform);
  }
  if (moduleName === "crypto") {
    return {
      type: "sourceFile",
      filePath: path.resolve(__dirname, "src/shims/node-crypto.ts"),
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withUniwindConfig(config, {
  cssEntryFile: "./src/global.css",
  debug: true,
});
