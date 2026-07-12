export type HealthDataAvailability = {
  status: "available" | "update_required" | "unavailable";
  providerPackage: string;
};

export type HealthDataPermissionStatus = {
  granted: boolean;
  grantedPermissions: string[];
  requiredPermissions: string[];
};

export type HealthDataActivity = {
  id: string;
  source: "health_connect";
  name: string;
  sport_type?: string;
  start_date: string;
  end_date?: string;
  distance_m?: number;
  moving_time_s?: number;
  elapsed_time_s?: number;
  total_elevation_gain_m?: number;
  average_heartrate?: number;
  data_origin?: string;
};

export type HealthDataActivityPage = {
  activities: HealthDataActivity[];
  nextPageToken?: string;
};
