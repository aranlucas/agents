import { NativeModule, requireNativeModule } from "expo";
import type {
  HealthDataActivityPage,
  HealthDataAvailability,
  HealthDataPermissionStatus,
} from "./health-data.types";

declare class HealthDataModule extends NativeModule<{}> {
  getAvailabilityAsync(): Promise<HealthDataAvailability>;
  getPermissionStatusAsync(): Promise<HealthDataPermissionStatus>;
  requestPermissionsAsync(): Promise<HealthDataPermissionStatus>;
  readActivitiesAsync(
    after: string,
    before: string,
    pageToken: string | null,
    pageSize: number,
  ): Promise<HealthDataActivityPage>;
}

export default requireNativeModule<HealthDataModule>("HealthData");
