import { registerWebModule, NativeModule } from "expo";
import type {
  HealthDataActivityPage,
  HealthDataAvailability,
  HealthDataPermissionStatus,
} from "./health-data.types";

class HealthDataModule extends NativeModule<{}> {
  async getAvailabilityAsync(): Promise<HealthDataAvailability> {
    return { status: "unavailable", providerPackage: "" };
  }

  async getPermissionStatusAsync(): Promise<HealthDataPermissionStatus> {
    return { granted: false, grantedPermissions: [], requiredPermissions: [] };
  }

  async requestPermissionsAsync(): Promise<HealthDataPermissionStatus> {
    return this.getPermissionStatusAsync();
  }

  async readActivitiesAsync(): Promise<HealthDataActivityPage> {
    return { activities: [] };
  }
}

export default registerWebModule(HealthDataModule, "HealthData");
