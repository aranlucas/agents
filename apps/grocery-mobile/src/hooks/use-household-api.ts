import { useAuth } from "@clerk/expo";
import { useMemo } from "react";
import { getRuntimeUrl } from "@/lib/config";
import { createHouseholdApi, type HouseholdApi } from "@/lib/household-api";

/** Keep the authenticated API client consistent across household-backed screens. */
export function useHouseholdApi(): { api: HouseholdApi; userId: string | null | undefined } {
  const { getToken, userId } = useAuth();
  const api = useMemo(
    () => createHouseholdApi({ baseUrl: getRuntimeUrl(), getToken, userId }),
    [getToken, userId],
  );

  return { api, userId };
}
