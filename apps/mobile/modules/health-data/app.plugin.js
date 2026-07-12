const { AndroidConfig, withAndroidManifest } = require("expo/config-plugins");

const HEALTH_PERMISSIONS = [
  "android.permission.health.READ_EXERCISE",
  "android.permission.health.READ_DISTANCE",
  "android.permission.health.READ_ELEVATION_GAINED",
  "android.permission.health.READ_HEART_RATE",
];

function withHealthData(config) {
  config.android = config.android ?? {};
  config.android.permissions = [
    ...new Set([...(config.android.permissions ?? []), ...HEALTH_PERMISSIONS]),
  ];

  return withAndroidManifest(config, (manifestConfig) => {
    const manifest = manifestConfig.modResults.manifest;
    manifest.queries = manifest.queries || [];
    if (
      !manifest.queries.some(
        (query) => query.package?.[0]?.$?.["android:name"] === "com.google.android.apps.healthdata",
      )
    ) {
      manifest.queries.push({
        package: [{ $: { "android:name": "com.google.android.apps.healthdata" } }],
      });
    }

    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(manifestConfig.modResults);
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(manifestConfig.modResults);
    mainActivity["intent-filter"] = mainActivity["intent-filter"] ?? [];
    if (
      !mainActivity["intent-filter"].some((filter) =>
        filter.action?.some(
          (action) =>
            action.$?.["android:name"] === "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE",
        ),
      )
    ) {
      mainActivity["intent-filter"].push({
        action: [{ $: { "android:name": "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" } }],
      });
    }

    application["activity-alias"] = application["activity-alias"] ?? [];
    if (
      !application["activity-alias"].some(
        (alias) => alias.$?.["android:name"] === "ViewPermissionUsageActivity",
      )
    ) {
      application["activity-alias"].push({
        $: {
          "android:name": "ViewPermissionUsageActivity",
          "android:exported": "true",
          "android:permission": "android.permission.START_VIEW_PERMISSION_USAGE",
          "android:targetActivity": ".MainActivity",
        },
        "intent-filter": [
          {
            action: [{ $: { "android:name": "android.intent.action.VIEW_PERMISSION_USAGE" } }],
            category: [{ $: { "android:name": "android.intent.category.HEALTH_PERMISSIONS" } }],
          },
        ],
      });
    }
    return manifestConfig;
  });
}

module.exports = withHealthData;
