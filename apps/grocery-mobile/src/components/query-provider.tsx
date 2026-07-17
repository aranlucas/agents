import NetInfo from "@react-native-community/netinfo";
import {
  focusManager,
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { AppState, type AppStateStatus, Platform } from "react-native";

function updateFocus(status: AppStateStatus) {
  focusManager.setFocused(status === "active");
}

export function createGroceryQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 2,
        networkMode: "online",
        refetchOnReconnect: true,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
        networkMode: "online",
      },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createGroceryQueryClient);

  useEffect(() => {
    if (Platform.OS === "web") return;

    updateFocus(AppState.currentState);
    const appStateSubscription = AppState.addEventListener("change", updateFocus);
    onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected === true && state.isInternetReachable !== false);
      }),
    );

    return () => {
      appStateSubscription.remove();
      onlineManager.setEventListener(() => () => undefined);
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
