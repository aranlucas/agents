import { useAuth } from "@clerk/clerk-expo";
import { fetch } from "expo/fetch";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import HealthData, {
  type HealthDataActivity,
  type HealthDataAvailability,
} from "../../modules/health-data";
import { getAgentsBaseUrl } from "@/utils/agent-config";

const LAST_SYNC_KEY = "fitness.health-connect.last-sync";
const INITIAL_SYNC_DAYS = 30;
const PAGE_SIZE = 100;
const MAX_PAGES = 5;

type SyncPhase =
  | "checking"
  | "unavailable"
  | "permission_required"
  | "ready"
  | "syncing"
  | "synced"
  | "error";

type SyncResponse = { accepted: number; synced_at: string };

export function useHealthDataSync() {
  const { getToken } = useAuth();
  const [phase, setPhase] = useState<SyncPhase>("checking");
  const [availability, setAvailability] = useState<HealthDataAvailability | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>();
  const [accepted, setAccepted] = useState(0);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void Promise.all([HealthData.getAvailabilityAsync(), SecureStore.getItemAsync(LAST_SYNC_KEY)])
      .then(async ([nextAvailability, storedSync]) => {
        if (!active) return;
        setAvailability(() => nextAvailability);
        if (storedSync) setLastSyncedAt(() => storedSync);
        if (nextAvailability.status !== "available") {
          setPhase("unavailable");
          return;
        }
        const permission = await HealthData.getPermissionStatusAsync();
        if (active) setPhase(permission.granted ? "ready" : "permission_required");
      })
      .catch(() => {
        if (active) setPhase("unavailable");
      });
    return () => {
      active = false;
    };
  }, []);

  const sync = useCallback(async () => {
    setPhase("syncing");
    setError(undefined);
    try {
      const nextAvailability = await HealthData.getAvailabilityAsync();
      setAvailability(nextAvailability);
      if (nextAvailability.status !== "available") {
        setPhase("unavailable");
        return;
      }
      let permission = await HealthData.getPermissionStatusAsync();
      if (!permission.granted) permission = await HealthData.requestPermissionsAsync();
      if (!permission.granted) {
        setPhase("permission_required");
        return;
      }

      const token = await getToken();
      if (!token) throw new Error("Sign in before syncing fitness data.");
      const before = new Date();
      const after = new Date(before.getTime() - INITIAL_SYNC_DAYS * 24 * 60 * 60 * 1000);
      let pageToken: string | null = null;
      let totalAccepted = 0;
      let latestSyncedAt = "";

      for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
        // Health Connect page tokens are sequential; the next request depends on this result.
        // eslint-disable-next-line no-await-in-loop
        const page = await HealthData.readActivitiesAsync(
          after.toISOString(),
          before.toISOString(),
          pageToken,
          PAGE_SIZE,
        );
        // Persist each bounded page before requesting the next one.
        // eslint-disable-next-line no-await-in-loop
        const result = await postActivities(page.activities, token);
        totalAccepted += result.accepted;
        latestSyncedAt = result.synced_at;
        pageToken = page.nextPageToken ?? null;
        if (!pageToken) break;
      }

      setAccepted(totalAccepted);
      setLastSyncedAt(latestSyncedAt);
      await SecureStore.setItemAsync(LAST_SYNC_KEY, latestSyncedAt);
      setPhase("synced");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Fitness sync failed.");
      setPhase("error");
    }
  }, [getToken]);

  return { accepted, availability, error, lastSyncedAt, phase, sync };
}

async function postActivities(
  activities: HealthDataActivity[],
  token: string,
): Promise<SyncResponse> {
  const response = await fetch(`${getAgentsBaseUrl()}/fitness/activities/sync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ activities }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
        ? body.error
        : `Fitness sync failed with HTTP ${response.status}.`;
    throw new Error(message);
  }
  const body: unknown = await response.json();
  if (!isSyncResponse(body)) throw new Error("Fitness sync returned an invalid response.");
  return body;
}

function isSyncResponse(value: unknown): value is SyncResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "accepted" in value &&
    typeof value.accepted === "number" &&
    "synced_at" in value &&
    typeof value.synced_at === "string"
  );
}
