"use client";

import { useQuery } from "@tanstack/react-query";

type AuthConnectionResponse = {
  connected: boolean;
};

async function fetchAuthConnection(endpoint: string): Promise<AuthConnectionResponse> {
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Failed to load auth connection from ${endpoint}`);
  }
  return response.json();
}

export function useAuthConnection({
  endpoint,
  enabled,
  queryKey,
}: {
  endpoint: string;
  enabled: boolean;
  queryKey: readonly string[];
}) {
  return useQuery({
    queryKey,
    queryFn: () => fetchAuthConnection(endpoint),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
}
