const { getDefaultConfig } = require("expo/metro-config");
const { withUniwindConfig } = require("uniwind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Segment reaches jose through its Node entry. Resolve only jose against its
// browser export so Metro keeps React Native conditions for every other module.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "jose" || moduleName.startsWith("jose/")) {
    return context.resolveRequest(
      { ...context, unstable_conditionNames: ["browser"] },
      moduleName,
      platform,
    );
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
