const { withXcodeProject } = require("expo/config-plugins");

const BUILD_PHASE_NAME = "[Expo Dev Launcher] Strip Local Network Keys for Release";

module.exports = function withExpoDevLauncherAlwaysRun(config) {
  return withXcodeProject(config, (config) => {
    const buildPhases = config.modResults.hash.project.objects.PBXShellScriptBuildPhase ?? {};

    for (const buildPhase of Object.values(buildPhases)) {
      if (
        typeof buildPhase === "object" &&
        buildPhase?.name?.replace(/^"|"$/gu, "") === BUILD_PHASE_NAME
      ) {
        // The phase edits the built Info.plist and must run for every configuration.
        buildPhase.alwaysOutOfDate = 1;
      }
    }

    return config;
  });
};
