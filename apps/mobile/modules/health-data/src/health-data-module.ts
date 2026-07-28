import { requireOptionalNativeModule } from "expo";
import type {
  HealthDataActivityPage,
  HealthDataAvailability,
  HealthDataPermissionStatus,
} from "./health-data.types";

type HealthDataModule = {
  getAvailabilityAsync(): Promise<HealthDataAvailability>;
  getPermissionStatusAsync(): Promise<HealthDataPermissionStatus>;
  requestPermissionsAsync(): Promise<HealthDataPermissionStatus>;
  readActivitiesAsync(
    after: string,
    before: string,
    pageToken: string | null,
    pageSize: number,
  ): Promise<HealthDataActivityPage>;
};

// The local Expo module is Android-only. Keep iOS and Expo Go import-safe so
// the Fitness route can render its existing unavailable state.
const unavailableHealthData: HealthDataModule = {
  async getAvailabilityAsync() {
    return { status: "unavailable", providerPackage: "" };
  },
  async getPermissionStatusAsync() {
    return { granted: false, grantedPermissions: [], requiredPermissions: [] };
  },
  async requestPermissionsAsync() {
    return { granted: false, grantedPermissions: [], requiredPermissions: [] };
  },
  async readActivitiesAsync() {
    return { activities: [] };
  },
};

export default requireOptionalNativeModule<HealthDataModule>("HealthData") ?? unavailableHealthData;
