// Re-export the native module. On web, it will be resolved to HealthDataModule.web.ts
// and on native platforms to HealthDataModule.ts
export { default } from "./src/health-data-module";
export * from "./src/health-data.types";
